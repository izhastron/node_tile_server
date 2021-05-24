const carto = require('carto')
const path = require('path')
const fs = require('fs').promises
const { parse, j2xParser  } = require('fast-xml-parser')
const {promisify} = require("bluebird")
const mapnik = require('mapnik')
const config = require('./config.json')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const STYLE_TEMPLATE = 'style_template.mml'
const STYLE_OUTPUT = 'style.xml'
const defaultParseOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@@_',
  cdataTagName: "__cdata",
  format: true
}
const XmlBuilder = new j2xParser(defaultParseOptions)

async function renderStyle() {
  try {
    let content = await fs.readFile(STYLE_TEMPLATE, 'utf-8')
    for(const key of Object.keys(config.osm)) {
      content = content.replace('@@' + key, '"' + config.osm[key] + '"')
    }
    const mml = new carto.MML()
    const data = await promisify(mml.load).bind(mml)(path.dirname(STYLE_TEMPLATE), content)
    const output = new carto.Renderer({filename: STYLE_TEMPLATE}).render(data)
    if (output.msg) {
      let error = false
      output.msg.forEach((message) => {
          if (message.type === 'error') {
            console.error(carto.Util.getMessageToPrint(message))
            error = true
          }
      })
      if (error) return false
    }
    if (output.data) {
      await fs.writeFile(path.join(__dirname, STYLE_OUTPUT), output.data, 'utf8')
      return true
    }
  } catch(e) {
    console.error(e)
    return false
  }
}

async function removeMissingLayers() {
  //FixMe (Так как карта может быть не вся, нужно удалить слои которых несуществует в выреще например "icesheet_polygons")
  const TEMPLATE = /encountered during parsing of layer \'.+\' in Layer/g
  let stylesheet = await fs.readFile(path.join(__dirname, STYLE_OUTPUT), 'utf8')
  mapnik.registerFonts(path.resolve('./fonts'))
  if (mapnik.register_default_fonts) mapnik.register_default_fonts()
  if (mapnik.register_default_input_plugins) mapnik.register_default_input_plugins()
  try {
    const jsonStyleSheet = parse(stylesheet, defaultParseOptions)
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
        for (let layer of coincidences) {
          console.log('Remove layer:', layer)
          jsonStyleSheet.Map.Layer = jsonStyleSheet.Map.Layer.filter(value => value['@@_name'] !== layer)
        }
      }
    }
    await fs.writeFile(path.resolve(__dirname, STYLE_OUTPUT), XmlBuilder.parse(jsonStyleSheet), 'utf-8')
    return true
  } catch(e) {
    console.error(e)
    console.error("Mapnik stylesheet not found")
  }
  return false
}

async function buildDatabase() {
  const file = process.argv[2]
  const { database, host, port, user, password } = config.osm

  if (!file) {
    console.error('Args not have pbf file for import database')
    return false
  }
  console.log('Try create user ', user)
  try {
    const { stdout } = await exec(`cd /tmp && sudo -u postgres psql -w -c 'CREATE USER ${osm_user}${password === ""? "" : ` WITH password ${password}`};' 2>&1`)
    if (stdout) console.log(stdout)
    console.log(`Create user ${user} success`)
  } catch(e) {
    console.error('Error create osm user:', user)
    console.error(e)
    return false
  }
  console.log('Try create database ', database)
  try {
    const { stdout, stderr } = await exec(`cd /tmp && sudo -u postgres psql -w -c 'CREATE DATABASE ${database} OWNER ${user};'  2>&1`)
    if (stdout) console.log(stdout)
    console.log(`Create database ${database} success`)
  } catch(e) {
    console.error('Error create database:', database)
    console.error(e)
    return false
  }
  console.log('Try create database extension postgis', database)
  try {
    const { stdout } = await exec(`cd /tmp && sudo -u postgres psql ${database} -w --command='CREATE EXTENSION postgis;' 2>&1`)
    if (stdout) console.log(stdout)
    console.log(`Create database extension postgis success`)
  } catch(e) {
    console.error('Error create database extension postgis')
    console.error(e)
    return false
  }
  console.log('Try create database extension hstore', database)
  try {
    const { stdout } = await exec(`cd /tmp && sudo -u postgres psql ${database} -w --command='CREATE EXTENSION hstore;'  2>&1`)
    if (stdout) console.log(stdout)
    console.log(`Create database extension hstore success`)
  } catch(e) {
    console.error('Error create database extension hstore')
    console.error(e)
    return false
  }
  console.log('Start import database data')
  const interval = setInterval(() => process.stdout('.'), 1000)
  const { stdout } = await exec(`osm2pgsql --create -G --hstore --tag-transform-script ./openstreetmap-carto.lua -S ./openstreetmap-carto.style -d ${database} -H ${host} -P ${port} -U ${user} ${password === "" ? "": "-P " + password + " -W"} ${file} 2>&1`)
  clearInterval(interval)
  if(stdout) console.log(stdout)
  console.log('Import data to database success')
  return true
}

async function bootstrap() {
  const isBuildDataBase = await buildDatabase() 
  if (!isBuildDataBase) {
    console.error('Error import database, please run npm run bootstrap filename.pbf')
    process.exit(1)
  }
  const isStyleRender = await renderStyle()
  if (!isStyleRender) {
    console.error('Error render style file')
    process.exit(1)
  }
  console.log('Style render complite')
  const isRemoved = await removeMissingLayers()
  if (!isRemoved) {
    console.error('Error remove missing layers')
    process.exit(1)
  }
  console.log('Remove layers complite')
}

bootstrap().then(() => {
  console.log('Bootstrap finish')
}).catch((e) => {
  console.error(e)
  console.error('Bootstrap fail')
})