const mapnik = require('mapnik')
const path = require('path')
const fs = require('fs')
const config = require('../config')
const logger = require("log4js").getLogger("tile_server")
const { promisify } = require('bluebird')
const { tileFactory, getIsRender, getIndex } = require('./tile')
const { sleep } = require('./utils')

let stylesheet

try {
  stylesheet = fs.readFileSync(path.join(__dirname, '..', config.stylesheetFile), 'utf8')
  mapnik.registerFonts(path.join(__dirname, '..', config.fontFolder))
  mapnik.register_default_fonts()
  mapnik.register_default_input_plugins()
} catch(e) {
  logger.fatal(e)
  process.exit(1)
}

class Job {
  constructor(tile, map) {
    this.tile = tile
    this.map = map
  }
  async render() {
    try {
      logger.debug('Job staring render')
      this.map.extent = this.tile.bbox
      const image = await promisify(this.map.render).bind(this.map)(new mapnik.Image(this.map.width, this.map.height))
      if (this.tile.type === 'meta') {
        const promises = []
        for(let x = 0; x < this.tile.count; x++) {
          for(let y = 0; y < this.tile.count; y++) {
            const subTile = this.tile.getTile(x, y)
            const subImage = image.view(x * subTile.size, y * subTile.size, subTile.size, subTile.size)
            promises.push(subTile.save(promisify(subImage.encode).bind(subImage)('png')))
          }
        }
        await Promise.all(promises)
      } else await this.tile.save(promisify(image.encode).bind(image)('png'))
      logger.debug('Job finish render')
    } catch(e) {
      logger.error(`Error render tile`)
      logger.error(e)
    }
  }
}
class RenderQueue {
  constructor(renderMap, index) {
    this.index = index
    this.map = new mapnik.Map(config.tileSize, config.tileSize)
    this.metaMap = new mapnik.Map(config.metaTileSize, config.metaTileSize)
    this.renderMap = renderMap
    this.push = this.push.bind(this)
    this.loop = this.loop.bind(this)
    this.jobs = []
    this.loop()
  }
  async loading() {
    return await Promise.all([
      promisify(this.map.fromString).bind(this.map)(stylesheet), 
      promisify(this.metaMap.fromString).bind(this.metaMap)(stylesheet)
    ])
  }
  push(tile) {
    logger.debug(`Create new job in queue ${this.index} x:${tile.x}, y:${tile.y}, z:${tile.z}, type:${tile.type},\n bbox:[${tile.bbox}]`)
    const job = new Job(tile, tile.type === 'meta' ? this.metaMap : this.map)
    this.jobs.push(job)
  }
  async loop() {
    while(true) {
      if (this.jobs.length > 0) {
        const job = this.jobs.shift()
        await job.render()
        if (this.renderMap.has(job.tile.index)) this.renderMap.delete(job.tile.index)
        else logger.info('Memory leak detected ', job.tile.index)
      }
      await sleep(50)
    }
  }
}

class RenderPool {
  constructor() {
    this.isRun = false
    this.renderMap = new Map()
    this.queues = []
    this.push = this.push.bind(this)
    for (let i = 0; i < config.threads; i++) {
      logger.info('Pool create render queue')
      this.queues[i] = new RenderQueue(this.renderMap, i)
    }
  }
  async loading() {
    const promises = []
    for (let i = 0; i < config.threads; i++) promises.push(this.queues[i].loading())
    await Promise.all(promises)
  }

  push(x, y, z) {
    if (this.renderMap.size > config.queueSize) {
      logger.error(`Error queue is full limit: ${config.queueSize} current: ${this.renderMap.size}`)
      throw Error('Error queue is full')
    }

    const index = getIndex(x, y, z)
    if (this.renderMap.has(index)) {
      logger.debug(`Tile not create return already rendering tile`)
      return getIsRender(this.renderMap.get(index), x, y)
    }
    else {
      const tile = tileFactory(x, y, z)
      this.renderMap.set(index, tile)
      logger.debug(`Create ${tile.type === 'meta'? 'meta': ''}tile x:${tile.x} y:${tile.y} z:${tile.z}`)
      const [freeQueue] = this.queues.sort((a, b) => {
        if ((a.jobs.length - b.jobs.length) === 0) {
          return a.index - b.index
        }
        return a.jobs.length - b.jobs.length
      })
      freeQueue.push(tile)
      return getIsRender(tile, x, y)
    }
  }
}

module.exports = new RenderPool()