const mapnik = require('mapnik')
const mercator = require('./sphericalmercator')
const path = require('path')
const fs = require('fs')
const config = require('./config.json')

mapnik.registerFonts(path.resolve(config.fonts.folder))
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
  constructor(x, y, z, map, image) {
    this.x = x
    this.y = y
    this.z = z
    this.resolve
    this.reject
    this.map = map
    this.image = image
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
  render() {
    try {
        return new Promise((res) => {
          this.map.extent = mercator.xyz_to_envelope(this.x,this.y, this.z)
          this.map.render(this.image, (err, tile) => {
            if (err) {
              console.error(err)
              this.reject(err)
              res()
            } else {
              tile.encode('png', (err, png) => {
                if (err) {
                  console.error(err)
                  this.reject(err)
                  res()
                } else {
                  this.resolve(png)
                  res()
                }
              })
            }
          })
        })
    } catch(e) {
      console.error(e)
      this.reject(Error(`Error render x:${this.x} y:${this.y} z:${this.z} tile`))
    }
  }
}
class Queue {
  constructor() {
    this.map = new mapnik.Map(256, 256)
    this.image = new mapnik.Image(this.map.width, this.map.height)
    this.add = this.add.bind(this)
    this.jobs = []
  }
  load() {
    return new Promise((res, rej) => {
      this.map.fromString(stylesheet, (err, _) => {
        if (err) rej(err)
        else res()
      })
    })
  }
  add(x, y, z) {
    const job = new Job(x, y, z, this.map, this.image)
    this.jobs.push(job)
    if (this.jobs.length === 1) {
      this.loop()
    }
    return job.promise
  }
  async loop() {
    while(true) {
      if (this.jobs.length === 0) break
      else {
        await this.jobs[0].render()
        this.jobs.shift()
      }
    }
  }
}

class Pool {
  constructor() {
    this.size = config.threads
    this.add = this.add.bind(this)
    this.start = this.start.bind(this)
    this.queues = []
    for (let i = 0; i < this.size; i++) {
      this.queues[i] = new Queue()
    }
    this.index = 0
    this.isRun = false
    this.stop = () => {
      throw Error('Pool not start')
    }
  }
  async load() {
    const promises = []
    for (let i = 0; i < this.size; i++) {
      promises.push(this.queues[i].load())
    }
    await Promise.all(promises)
  }
  start() {
    this.isRun = true
    return new Promise((resolve) => {
      this.stop = resolve.bind(this)
    })
  }
  async add(x, y, z) {
    if (this.isRun) {
      if (this.index === this.size) this.index = 0
      const promise = await this.queues[this.index++].add(x, y, z)
      return promise
    } else {
      throw Error('Pool not start')
    }
  }
}

module.exports.Pool = Pool