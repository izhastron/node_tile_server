const mapnik = require('mapnik')
const path = require('path')
const fs = require('fs')
const { tileSize, metaTileSize, threads, fonts, queueSize } = require('./config.json')
const { promisify} = require('bluebird')
const { tileFactory, getIsRender } = require('./meta_tile')

let stylesheet

try {
  stylesheet = fs.readFileSync(path.join(__dirname, 'style.xml'), 'utf8')
  mapnik.registerFonts(path.resolve(fonts.folder))
  mapnik.register_default_fonts()
  mapnik.register_default_input_plugins()
} catch(e) {
  console.error(e)
  process.exit(1)
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
            await subTile.save(await promisify(subImage.encode).bind(subImage)('png'))
          }
        }
      } else await this.tile.save(await promisify(image.encode).bind(image)('png'))
    } catch(e) {
      console.error(e)
    }
  }
}
class RenderQueue {
  constructor(renderMap) {
    this.map = new mapnik.Map(tileSize, tileSize)
    this.metaMap = new mapnik.Map(metaTileSize, metaTileSize)
    this.renderMap = renderMap
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
    if (this.jobs.length === 1) this.loop()
  }
  async loop() {
    while(true) {
      if (this.jobs.length === 0) break
      else {
        await this.jobs[0].render()
        const index = this.jobs.shift().tile.index
        if (this.renderMap.has(index)) this.renderMap.delete(index)
      }
    }
  }
}

class RenderPool {
  constructor() {
    this.isRun = false
    this.renderMap = new Map()
    this.queues = []
    this.push = this.push.bind(this)
    for (let i = 0; i < threads; i++) {
      this.queues[i] = new RenderQueue(this.renderMap)
    }
  }
  async loading() {
    const promises = []
    for (let i = 0; i < threads; i++) promises.push(this.queues[i].loading())
    await Promise.all(promises)
  }

  push(x, y, z) {
    if (this.renderMap.size > queueSize) throw Error('Error queue is full')

    const tile = tileFactory(x, y, z)
    if (this.renderMap.has(tile.index)) {
      return getIsRender(this.renderMap.get(tile.index), x, y)
    }
    else {
      this.renderMap.set(tile.index, tile)
      const [freeQueue] = this.queues.sort((a, b) => a.jobs.length - b.jobs.length)
      freeQueue.push(tile)
      return getIsRender(tile, x, y)
    }
  }
}

module.exports.RenderPool = RenderPool