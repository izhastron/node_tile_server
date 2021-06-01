const fs = require('fs').promises
const path = require('path')
const mercator = require('./sphericalmercator')
const config = require('../config')
const logger = require("log4js").getLogger("tile_server")


const count =  parseInt(config.metaTileSize / config.tileSize)
const getIndex = (x, y, z) => (z > config.zLimit) && config.tileSize !== config.metaTileSize ? `meta_${parseInt(x/count)}_${parseInt(y/count)}_${z - parseInt(Math.log2(count))}`: `tile_${x}_${y}_${z}`


class Tile {
  constructor(x, y, z) {
    this.resolve
    this.reject
    this.x = x
    this.y = y
    this.z = z
    this.size = config.tileSize
    this.type = 'tile'
    this.index = getIndex(x, y, z)
    this.bbox = mercator.xyzToEnvelope(this.x, this.y, this.z)
    this.isRender = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
      this.reject.bind(this)
      this.resolve.bind(this)
    })
  }

  async save(promiseImage) {
    const image = await promiseImage
    logger.debug(`x:${this.x} y:${this.y} z:${this.z} tile is rendered`)
    try {
      if (config.cache.enable) {
        const imagePath = path.resolve(config.cache.directory, String(this.z), String(this.x))
        await fs.mkdir(imagePath, { recursive: true })
        await fs.writeFile(path.resolve(imagePath, String(this.y) + '.png'), image)
        logger.debug(`x:${this.x} y:${this.y} z:${this.z} tile is cached ${path.resolve(config.cache.directory, String(this.z), String(this.x))}`)
      }
    } catch(e) {
      logger.error(e)
    }
    this.resolve(image)
  }
}

class MetaTile {
  constructor(x, y, z) {
    this.resolve
    this.reject
    this.isRender = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
      this.reject.bind(this)
      this.resolve.bind(this)
    })
    this.type = 'meta'
    this.count = parseInt(config.metaTileSize / config.tileSize)
    this.x = parseInt(x/this.count)
    this.y = parseInt(y/this.count)
    this.z = z - parseInt(Math.log2(this.count))
    this.index = getIndex(x, y, z)
    this.size = config.metaTileSize
    this.bbox = mercator.xyzToEnvelope(this.x, this.y, this.z)
    this.tiles = []
    this.xIndex = Array.from(Array(this.count).keys()).map(value => this.x * this.count + value)
    this.yIndex = Array.from(Array(this.count).keys()).map(value => this.y * this.count + value)
    for (let x = 0; x < this.count; x++) {
      for (let y = 0; y < this.count; y++) {
        if (!this.tiles[x]) this.tiles[x] = []
        this.tiles[x][y] = new Tile(this.xIndex[x], this.yIndex[y], z)
      }
    }
  }
  getTileXY(X, Y) {
    for (let x = 0; x < this.count; x++) {
      for (let y = 0; y < this.count; y++) {
        const tile = this.getTile(x, y)
        if (tile.x === X && tile.y === Y) {
          return tile
        }
      }
    }
    logger.error('Error find tile in meta tile', JSON.stringify(this))
  }
  getTile(x, y) {
    return this.tiles[x][y]
  }

  async saveTile(x, y, image) {
    return this.tiles[x][y].save(image)
  }
}


module.exports.getIndex = getIndex
module.exports.getIsRender = (tile, x, y) => tile.type === 'meta' ? tile.getTileXY(x, y).isRender : tile.isRender
module.exports.tileFactory = (x, y, z) => (z > config.zLimit) && config.tileSize !== config.metaTileSize  ? new MetaTile(x ,y, z) : new Tile(x, y, z)