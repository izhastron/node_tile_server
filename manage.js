const config = require('./config')
const { psql, db } = require('./src/database')
const logger = require("log4js").getLogger("tile_manage")
logger.level = 'debug'
const carto = require('carto')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const { parse, j2xParser  } = require('fast-xml-parser')
const {promisify} = require("bluebird")
const mapnik = require('mapnik')
const pty = require('node-pty')
const XmlBuilder = new j2xParser(config.defaultParseOptions)

const options = {
  dropdb: false,
  createdb: false,
  help: false,
  stylization: false,
  file: false,
  config: false
}
const helpText = `
command:

npm run manage -- [options]:

options:

  --file=osm_data.pbf - Protobuf osm data file
  --createdb - Create osm database and user
  --dropdb - Drop osm user and database
  --stylization - Render style for mapnik
  --help - This help text 
  --config - Custom path for config.json file
`


async function createDatabase() {
  const {rows: users} = await psql.query('select rolname FROM pg_catalog.pg_roles')
  if (!users.map(({rolname}) => rolname).includes(config.osm.user)) {
    try {
      await psql.query(`CREATE ROLE ${config.osm.user} LOGIN`)
      logger.info(`Role ${config.osm.user} created`)
    } catch(e) {
      logger.fatal(e)
      process.exit(1)
    }
  } else {
    logger.fatal(`Role ${config.osm.user} is exist`)
    logger.info('You can delete the database with the command npm run manage -- --dropdb')
    process.exit(1)
  }
  const {rows: databases} = await psql.query('SELECT datname FROM pg_database where datistemplate = false')
  if (!databases.map(({datname}) => datname).includes(config.osm.database)) {
    try { 
      await psql.query(`CREATE DATABASE ${config.osm.database} OWNER ${config.osm.user}`)
      logger.info(`Database ${config.osm.database} create by owner ${config.osm.user}`)
    } catch(e) {
      logger.fatal(e)
      logger.info('You can delete the database with the command "npm run manage -- --dropdb"')
      process.exit(1)
    }
  } else {
    logger.fatal(`Database ${config.osm.database} is exist`)
    process.exit(1)
  }
  try {
    await psql.queryOsm('CREATE EXTENSION postgis')
    await psql.queryOsm('CREATE EXTENSION hstore')
    logger.info('Extension postgis and hstore created')
  } catch(e) {
    logger.fatal(e)
    logger.fatal('Error create extension')
    process.exit(1)
  }
  try {
    fsSync.accessSync(path.resolve(options.file), fsSync.constants.F_OK) 
  } catch(e) {
    logger.fatal(e, `Error access to file: ${path.resolve(options.file)}`)
    process.exit(1)
  }
  logger.info('Start upload data to database')
  const promise = new Promise((resolve, reject) => {
    try {
      const shell = pty.spawn('bash', [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
      })
      shell.onData((data) => process.stdout.write(data))
      shell.onExit(() => {
        logger.info('Finish upload data to database')
        resolve()
      })
      shell.write(`osm2pgsql ${config.import.slim ? '--slim': ''} --number-processes ${config.import.process} -C ${config.import.ram} --create -G --hstore --tag-transform-script ${path.resolve('./openstreetmap-carto.lua')} -S ${path.resolve('./openstreetmap-carto.style')} -d ${config.osm.database} -H ${config.osm.host} -P ${config.osm.port} -U ${config.osm.user} ${config.osm.password ? '--password ' + config.osm.password : ''} ${path.resolve(options.file)} 2>&1 && exit\r`)
    } catch(e) {
      reject(e)
    }
  })
  try {
  await promise
  } catch(e) {
    logger.fatal(e)
    process.exit(1)
  }
}

async function dropDatabase() {
  const {rows: databases} = await psql.query('SELECT datname FROM pg_database where datistemplate = false')
  if (databases.map(({datname}) => datname).includes(config.osm.database)) {
    try {
      await psql.query(`DROP DATABASE ${config.osm.database}`)
      logger.info(`Database ${config.osm.database} drop`)
    } catch(e) {
      logger.fatal(e)
      process.exit(1)
    }
  } else {
    logger.info('Database not exist')
  }
  const {rows: users} = await psql.query('select rolname FROM pg_catalog.pg_roles')
  if (users.map(({rolname}) => rolname).includes(config.osm.user)) {
    try {
      await psql.query(`DROP ROLE ${config.osm.user}`)
      logger.info(`Role ${config.osm.user} drop`)
    } catch(e) {
      logger.fatal(e)
      process.exit(1)
    }
  } else {
    logger.info('Role not exist')
  }
}

async function stylization() {
  logger.info('Start render style template')
  try {
    let content = await fs.readFile(config.stylesheetTemplateFile, 'utf-8')
    for(const key of Object.keys(config.osm).filter(value => value !== 'postgresPassword')) {
      content = content.replace('@@' + key, '"' + config.osm[key] + '"')
    }
    const mml = new carto.MML()
    const data = await promisify(mml.load).bind(mml)(path.dirname(config.stylesheetTemplateFile), content)
    const output = new carto.Renderer({filename: config.stylesheetTemplateFile}).render(data)
    if (output.msg) {
      let error = false
      output.msg.forEach((message) => {
          if (message.type === 'error') {
            logger.error(carto.Util.getMessageToPrint(message))
            error = true
          }
      })
      if (error) {
        logger.fatal('Fail render style template')
        process.exit(1)
      }
    }
    if (output.data) await fs.writeFile(path.join(__dirname, config.stylesheetFile), output.data, 'utf8')
  } catch(e) {
    logger.fatal(e)
    process.exit(1)
  }
  logger.info('Finish render style template')
  logger.info('Start remove unused layers')
  //FixMe (Так как карта может быть не вся, нужно удалить слои которых несуществует в вырезе например "icesheet_polygons")
  const TEMPLATE = /encountered during parsing of layer \'.+\' in Layer/g
  const stylesheet = await fs.readFile(path.join(__dirname, config.stylesheetFile), 'utf8')
  mapnik.registerFonts(path.resolve(config.fontFolder))
  if (mapnik.register_default_fonts) mapnik.register_default_fonts()
  if (mapnik.register_default_input_plugins) mapnik.register_default_input_plugins()
  try {
    const jsonStyleSheet = parse(stylesheet, config.defaultParseOptions)
    while (true) {
      try {
        const map = new mapnik.Map(256, 256)
        await promisify(map.fromString).bind(map)(XmlBuilder.parse(jsonStyleSheet))
        break
      } catch(e) {
        const mathes = e.message.match(TEMPLATE) || []
        const coincidences = Array.from(new Set(mathes.map(value => {
          return value.replace(`encountered during parsing of layer '`, '').replace(`' in Layer`, '')
        })))
        if (coincidences.length === 0) {
          logger.info('All layers used')
          break
        }
        for (let layer of coincidences) {
          logger.info('Remove layer:', layer)
          jsonStyleSheet.Map.Layer = jsonStyleSheet.Map.Layer.filter(value => value['@@_name'] !== layer)
        }
      }
    }
    await fs.writeFile(path.resolve(__dirname, config.stylesheetFile), XmlBuilder.parse(jsonStyleSheet), 'utf-8')
  } catch(e) {
    logger.fatal(e)
    process.exit(1)
  }
  logger.info('Finish remove unused layers')
}

async function run() {
  const args = process.argv.slice(2, process.argv.length).reduce((acc, value) => {
    return {...acc, [value.replace(/(^\-*)|(=.*)/g, '')]: value.includes('=') ? value.split('=')[1] : true }
  }, {})
  Object.keys(options).map(key => {
    options[key] = args[key] ? args[key] : options[key]
  })
  if (options.help || Object.keys(args).length === 0) {
    console.log(helpText)
    return
  }
  if (options.createdb && !options.file) {
    logger.fatal('Create database required --file options')
    process.exit(1)
  }
  if (options.dropdb) {
    await dropDatabase()
  }
  if (options.createdb) {
    await createDatabase()
  }
  if (options.stylization) {
    await stylization()
  }
}

run().then(() => {
  psql.close()
}).catch((e) => {
  logger.fatal(e)
  psql.close()
  process.exit(1)
})