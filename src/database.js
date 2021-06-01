const Pool = require('pg-pool')
const config = require('../config')
const logger = require("log4js").getLogger("tile_server")

class PsqlDatabase {
  constructor() {
    this.isConnect = false
    this.isConnectOsm = false
    this.client = null
    this.clientOsm = null
    this.db = new Pool({
      user: 'postgres',
      ...config.osm.postgresPassword ? {password: config.osm.postgresPassword} : {},
      host: config.osm.host,
      port: config.osm.port,
      database: 'postgres',
    })
    this.dbOsm = new Pool({
      user: 'postgres',
      ...config.osm.postgresPassword ? {password: config.osm.postgresPassword} : {},
      host: config.osm.host,
      port: config.osm.port,
      database: config.osm.database,
    })
  }
  async connect() {
    try {
      this.client = await this.db.connect()
      this.isConnect = true
    } catch(e) {
      logger.fatal('Check pg_hba.conf for connection configuration')
      logger.fatal(e)
      process.exit(1)
    }
  }

  async connectOsm() {
    try {
      this.clientOsm = await this.dbOsm.connect()
      this.isConnectOsm = true
    } catch(e) {
      logger.fatal('Check pg_hba.conf for connection configuration')
      logger.fatal(e)
      process.exit(1)
    }
  }
  async query(...args) {
    if (!this.isConnect) await this.connect()
    return this.client.query(...args)
  }
  async queryOsm(...args) {
    if (!this.isConnectOsm) await this.connectOsm()
    return this.clientOsm.query(...args)
  }
  async close() {
    if (this.client) {
      this.client.release()
      this.db.end()
    }
    if (this.clientOsm) {
      this.clientOsm.release()
      this.dbOsm.end()
    }
  }
}

class Database {
  constructor() {
    this.isInit = false
    this.client = null
    this.db = new Pool({
      user: config.osm.user,
      ...config.osm.password ? {password: config.osm.password} : {},
      host: config.osm.host,
      port: config.osm.port,
      database: config.osm.database,
    })
  }
  async init() {
    try {
      this.client = await this.db.connect()
      this.isInit = true
    } catch(e) {
      logger.fatal('Check pg_hba.conf for connection configuration')
      logger.fatal(e)
      process.exit(1)
    }
  }
  async query(...args) {
    if (!this.isInit) await this.init()
    return this.client.query(...args)
  }

  async close() {
    if (!this.isInit) await this.init()
    this.client.release()
    this.db.end()
  }
}


const psql = new PsqlDatabase()
const db = new Database()

module.exports.psql = psql
module.exports.db = new Database()