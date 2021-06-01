const configJson = require('./config.json')
const path = require('path')
const fs = require('fs')
const logger = require("log4js").getLogger("tile_server")

function printError(...messages) {
  for(const message of messages) {
    logger.fatal(message)
  }
  process.exit(1)
}
// config validation
if (!["debug", "info", "warn", "error", "fatal", "off"].includes(configJson.loggerLevel)) {
  console.fatal('Error type debug level')
  process.exit(1)
}
logger.level = configJson.loggerLevel
if (!configJson) printError('Error parse config')
if (typeof(configJson.threads) !== 'number') printError('"threads" config property is not number')
if (configJson.threads < 1) printError('"threads" can\'t less then 1')
if (configJson.threads !== parseInt(configJson.threads)) printError('"threads" must be an integer')
if (typeof(configJson.maxZoom) !== 'number') printError('"maxZoom" config property is not number')
if (configJson.maxZoom < 1) printError('"threads" can\'t less then 1')
if (configJson.maxZoom !== parseInt(configJson.maxZoom)) printError('"maxZoom" must be an integer')
if (typeof(configJson.minZoom) !== 'number') printError('"minZoom" config propery is not number')
if (configJson.minZoom < 0) printError('"minZoom" can\'t less then 0')
if (configJson.minZoom !== parseInt(configJson.minZoom)) printError('"minZoom" must be an integer')
if (typeof(configJson.tileSize) !== 'number') printError('"tileSize" config propery is not number')
if (configJson.tileSize !== parseInt(configJson.tileSize)) printError('"tileSize" must be an integer')
if (typeof(configJson.metaTileSize) !== 'number') printError('"tileSize" config propery is not number')
if (configJson.metaTileSize !== parseInt(configJson.metaTileSize)) printError('"metaTileSize" must be an integer')
if (![0, 1, 2, 3, 4].includes(parseInt(Math.log2(configJson.metaTileSize/configJson.tileSize)))) printError('Bad proportion metaTileSize and tileSize log2(metaTileSize/tileSize) = 0, 1, 2, 3, 4')
if (typeof(configJson.queueSize) !== 'number') printError('"queueSize" config propery is not number') 
if (configJson.queueSize !== parseInt(configJson.queueSize)) printError('"queueSize" must be an integer')
if (typeof(configJson.osm) !== 'object')  printError('"osm" must be an object')
if (typeof(configJson.osm.database) !== 'string' && configJson.osm.database.length === 0) printError('"osm.database" must be an string')
if (typeof(configJson.osm.host) !== 'string' && configJson.osm.host.length === 0) printError('"osm.host" must be an string')
if (typeof(configJson.osm.port) !== 'number' && configJson.osm.port > 65536) printError('"osm.host" must be an integer and less then 65536')
if (configJson.osm.password) {
  if (typeof(configJson.osm.password) !== "string") printError('"osm.password" must be an string')
} 
if (configJson.osm.geometryField) {
  if (typeof(configJson.osm.geometryField) !== "string") printError('"osm.geometryField" must be an string')
} 
if (typeof(configJson.osm.user) !== "string") printError('"osm.user" must be an string')

if (configJson.osm.postgresPassword) {
  if (typeof(configJson.psql.password) !== "string") printError('"psql.password" must be an string')
} 
if (typeof(configJson.cache) !== 'object') printError('"cache" must be an object')
if (typeof(configJson.cache.enable) !== 'boolean') printError('"cache.enable" must be an boolean')
if (configJson.cache.enable) {
  if (typeof(configJson.cache.directory) !== 'string') printError('"cache.directory" must be an string')
}
if (configJson.stylesheetFile) {
  if(typeof(configJson.stylesheetFile) !== 'string') printError('"stylesheetFile" must be an string')
}
if (configJson.fontFolder) {
  if(typeof(configJson.fontFolder) !== 'string') printError('"fontFolder" must be an string')
}
if (configJson.stylesheetTemplateFile) {
  if(typeof(configJson.stylesheetTemplateFile) !== 'string') printError('"stylesheetTemplateFile" must be an string')
}
if (typeof(configJson.server) !== "object") printError('"server" must be an object')
if (configJson.server.address) {
  if(typeof(configJson.server.address) !== 'string') printError('"server.address" must be an string')
}
if (configJson.server.port) {
  if(typeof(configJson.server.port) !== 'number') printError('"server.port" must be an number')
}

class Config {
  constructor() {
    this.threads = configJson.threads
    this.maxZoom = configJson.maxZoom
    this.minZoom = configJson.minZoom
    this.tileSize = configJson.tileSize
    this.metaTileSize = configJson.metaTileSize
    this.queueSize = configJson.queueSize
    this.stylesheetFile = configJson.stylesheetFile ? configJson.stylesheetFile : './style.xml'
    this.stylesheetTemplateFile = configJson.stylesheetTemplateFile ? configJson.stylesheetTemplateFile : './style_template.mml'
    this.fontFolder = configJson.fontFolder ? configJson.fontFolder :'./fonts'
    this.zLimit = parseInt(Math.log2(this.metaTileSize/this.tileSize))
    this.osm = {
      user: configJson.osm.user,
      database: configJson.osm.database,
      host: configJson.osm.host,
      port: String(configJson.osm.port),
      password: !configJson.osm.password ? '' : configJson.osm.password,
      postgresPassword: !configJson.osm.postgresPassword ? '' : configJson.osm.postgresPassword,
      geometryField: !configJson.osm.geometryField ? 'way' : configJson.osm.geometryField,
    }
    this.isDebug = configJson.loggerLevel === 'debug' ? true : false
    this.cache = {
      enable: configJson.cache.enable,
      directory: configJson.cache.directory
    }
    this.server = {
      address: configJson.server.address? configJson.server.address : '127.0.0.1',
      port: configJson.server.port ? configJson.server.port : Math.ceil(Math.random()*64535 + 1000)
    }
    this.defaultParseOptions = {
      ignoreAttributes: false,
      attributeNamePrefix: '@@_',
      cdataTagName: "__cdata",
      format: true
    }
  }
}
const config = new Config()

try {
  fs.accessSync(path.resolve(config.fontFolder), fs.constants.F_OK) 
} catch(e) {
  printError(e, 'Error access to font folder')
}
try {
  if (config.cache.enable) fs.accessSync(path.resolve(config.cache.directory), fs.constants.F_OK)
} catch(e) {
  printError(e, 'Error access to cache folder')
}
logger.info("Parse config success")
Object.freeze(config)
module.exports = config