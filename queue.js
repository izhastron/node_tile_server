const mapnik = require('mapnik')
const path = require('path')
const fs = require('fs')
const {tileSize, metaTileSize, threads, fonts} = require('./config.json')
const {promisify} = require('bluebird')
const {MetaTile, Tile} = require('./meta_tile')

if (![0, 1, 2, 4, 8, 16].includes(parseInt(Math.log2(metaTileSize/tileSize)))){
  console.log('Bad value metaTileSize in config.json')
  process.exit(1)
}

mapnik.registerFonts(path.resolve(fonts.folder))
if (mapnik.register_default_fonts) mapnik.register_default_fonts()
if (mapnik.register_default_input_plugins) mapnik.register_default_input_plugins()
let stylesheet
try {
  stylesheet = fs.readFileSync(path.join(__dirname, 'style.xml'), 'utf8')
} catch(e) {
  console.error(e)
  console.error("Mapnik stylesheet not found")
}

class Job {
  constructor(tile, map) {
    this.map = map
    this.tile = tile
    this.map.extent = this.tile.bbox
    this.image = new mapnik.Image(this.map.width, this.map.height)
  }
  async render() {
    try {
      const image = await promisify(this.map.render).bind(this.map)(this.image)
      if (this.tile.type === 'meta') {
        for(let x = 0; x < this.tile.count; x++) {
          for(let y = 0; y < this.tile.count; y++) {
            const subTile = this.tile.getTile(x, y)
            const subImage = image.view(x * subTile.size, y * subTile.size, subTile.size, subTile.size)
            await subTile.save(promisify(subImage.encode).bind(subImage)('png'))
          }
        }
      } else {
        await this.tile.save(promisify(image.encode).bind(image)('png'))
      }
    } catch(e) {
      console.error(e)
      this.reject(Error(`Error render x:${this.tile.x} y:${this.tile.y} z:${this.tile.z} type:${this.tile.type} tile`))
    }
  }
}
class Queue {
  constructor(isRenderingMap) {
    this.map = new mapnik.Map(tileSize, tileSize)
    this.metaMap = new mapnik.Map(metaTileSize, metaTileSize)
    this.isRenderingMap = isRenderingMap
    this.push = this.push.bind(this)
    this.jobs = []
  }
  async loading() {
    return await Promise.all([
      promisify(this.map.fromString).bind(this.map)(stylesheet), 
      promisify(this.metaMap.fromString).bind(this.metaMap)(stylesheet)
    ])
  }
  push(tile) {
    const job = new Job(tile, tile.type === 'meta' ? this.metaMap : this.map)
    this.jobs.push(job)
    if (this.jobs.length === 1) {
      this.loop()
    }
  }
  async loop() {
    while(true) {
      if (this.jobs.length === 0) break
      else {
        await this.jobs[0].render()
        const index = this.jobs.shift().tile.index
        if (this.isRenderingMap.has(index)) this.isRenderingMap.delete(index)
      }
    }
  }
}

class RenderQueue {
  constructor() {
    this.isRun = false
    this.isRenderingMap = new Map()
    this.threads = threads
    this.queues = []
    this.push = this.push.bind(this)
    this.start = this.start.bind(this)
    this.stop = () => {
      throw Error('RenderQueue not start')
    }
    for (let i = 0; i < this.threads; i++) {
      this.queues[i] = new Queue(this.isRenderingMap)
    }
  }
  async loading() {
    const promises = []
    for (let i = 0; i < this.threads; i++) {
      promises.push(this.queues[i].loading())
    }
    await Promise.all(promises)
  }
  start() {
    this.isRun = true
    return new Promise((resolve) => {
      this.stop = resolve.bind(this)
    })
  }
  push(x, y, z) {
    if (this.isRun) {
      let tile = (z > parseInt(Math.log2(metaTileSize/tileSize))) && tileSize !== metaTileSize  ? new MetaTile(x ,y, z) : new Tile(x, y, z)
      let result = tile.type === 'meta' ? tile.getTileXY(x, y).isRender : tile.isRender
      if (this.isRenderingMap.has(tile.index)) {
        const tmpTile = this.isRenderingMap.get(tile.index)
        result = tmpTile.type === 'meta' ? tmpTile.getTileXY(x, y).isRender : tmpTile.isRender
      }
      else {
        this.isRenderingMap.set(tile.index, tile)
        result = tile.type === 'meta' ? tile.getTileXY(x, y).isRender : tile.isRender
        const [freeQueue] = this.queues.sort((a, b) => a.jobs.length - b.jobs.length)
        freeQueue.push(tile)
      }
      return result
    } else {
      throw Error('RenderQueue not start')
    }
  }
}

module.exports.RenderQueue = RenderQueue