const fs = require('fs').promises
const path = require('path')
const mercator = require('./sphericalmercator')
const { tileSize, metaTileSize, cache } = require('./config.json')

if (![0, 1, 2, 3, 4].includes(parseInt(Math.log2(metaTileSize/tileSize)))){
  console.log('Bad value metaTileSize in config.json')
  process.exit(1)
}
const limitZ = parseInt(Math.log2(metaTileSize/tileSize))

class Tile {
  constructor(x, y, z) {
    this.resolve
    this.reject
    this.x = x
    this.y = y
    this.z = z
    this.size = tileSize
    this.type = 'tile'
    this.index = `tile_${x}_${y}_${z}`
    this.bbox = mercator.xyzToEnvelope(this.x, this.y, this.z)
    this.isRender = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
      this.reject.bind(this)
      this.resolve.bind(this)
    })
  }

  async save(image) {
    try {
      if (cache.enable) {
        const imagePath = path.resolve(cache.directory, String(this.z), String(this.x))
        await fs.mkdir(imagePath, { recursive: true })
        await fs.writeFile(path.resolve(imagePath, String(this.y) + '.png'), image)
      }
      this.resolve(image)
    } catch(e) {
      console.error(e)
      this.resolve(false)
    }
  }
}

class MetaTile {
  constructor(x, y, z) {
    if ((z - 3) < 0) throw Error('Can not render metatile where zoom < 0')
    this.resolve
    this.reject
    this.isRender = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
      this.reject.bind(this)
      this.resolve.bind(this)
    })
    this.type = 'meta'
    this.count = parseInt(metaTileSize / tileSize)
    this.x = parseInt(x/this.count)
    this.y = parseInt(y/this.count)
    this.z = z - parseInt(Math.log2(this.count))
    this.index = `meta_${this.x}_${this.y}_${this.z}`
    this.size = metaTileSize
    this.bbox = mercator.xyzToEnvelope(this.x, this.y, this.z)
    this.tiles = []
    this.xIndex = [0,1,2,3,4,5,6,7].map(value => this.x * this.count + value)
    this.yIndex = [0,1,2,3,4,5,6,7].map(value => this.y * this.count + value)
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
  }
  getTile(x, y) {
    return this.tiles[x][y]
  }

  async saveTile(x, y, image) {
    return this.tiles[x][y].save(image)
  }
}

module.exports.getIsRender = (tile, x, y) => tile.type === 'meta' ? tile.getTileXY(x, y).isRender : tile.isRender
module.exports.tileFactory = (x, y, z) => (z > limitZ) && tileSize !== metaTileSize  ? new MetaTile(x ,y, z) : new Tile(x, y, z)