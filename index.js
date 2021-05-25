 
const express = require('express')
const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { parseXYZ } = require('./utils')
const { RenderPool } = require('./queue')
const { cache } = require('./config.json')

const app = express()
const port = 3000
const renderPool = new RenderPool()
const DEBUG = false

app.get('/', async (req, res) => {
  try {
    const page = await fs.readFile(path.resolve(__dirname, 'index.html'))
    res.writeHead(500, {'Content-Type': 'text/html'})
    return res.end(page)
  } catch(e) {
    console.error(e)
    res.writeHead(500, {'Content-Type': 'text/plain'})
    if (DEBUG) return res.end(e.message)
    else return res.end('Server error 500')
  }
})

app.get('/:x/:y/:z', async (req, res) => {
  const [x, y, z] = parseXYZ(req)

  if ([x, y, z].includes(undefined)) {
    res.writeHead(500, {'Content-Type': 'text/plain'})
    return res.end('Error parse x, y, z')
  }

  if (cache.enable) {
    try {
      const tile = await fs.readFile(path.resolve(cache.directory, [z, x, y].join('/') + '.png'))
      res.writeHead(200, {'Content-Type': 'image/png'})
      return res.end(tile)
    } catch(e) {}
  }
  
  try {
    const tile = await renderPool.push(x, y, z)
    if (tile !== false) {
      res.writeHead(200, {'Content-Type': 'image/png'})
      return res.end(tile)
    } else {
      res.writeHead(500, {'Content-Type': 'text/plain'})
      return res.end('Server error 500')
    }
  } catch(e) {
    console.error(e)
    res.writeHead(500, {'Content-Type': 'text/plain'})
    if (DEBUG) return res.end(e.message)
    else return res.end('Server error 500')
  }
})

async function main() {
  console.log('Loading stylesheet and start server...')
  try {
    if (cache.enable) await fs.access(path.resolve(cache.directory), fsSync.constants.F_OK)
    await renderPool.loading()
  } catch(e) {
    console.error(e)
    process.exit(1)
  }
}

main().then(() => {
  app.listen(port, () => console.log(`Tile server start http://localhost:${port}`))
})
