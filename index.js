 
const express = require('express')
const app = express()
const { parseXYZ } = require('./utils')
const { RenderQueue } = require('./queue')
const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { cacheDirectory, tileSize, metaTileSize } = require('./config.json')
const port = 3000
const renderQueue = new RenderQueue()
const DEBUG = true


app.get('/', async (req, res) => {
  try {
    const index = await fs.readFile(path.resolve(__dirname, 'index.html'))
    res.writeHead(500, {'Content-Type': 'text/html'})
    res.end(index)
  } catch(e) {
    console.error(e)
    res.writeHead(500, {'Content-Type': 'text/plain'})
    if (DEBUG) res.end(e.message)
    else res.end('Server error')
  }
})
app.get('/:x/:y/:z', async (req, res) => {
  const [x, y, z] = parseXYZ(req)
  if (!x || !y || !y) {
    console.log('No x, y, z provided')
    res.writeHead(500, {'Content-Type': 'text/plain'})
    res.end('No x, y, z provided')
    return
  }
  try {
    const tile = await fs.readFile(path.resolve(cacheDirectory, String(z), String(x) , String(y) + '.png'))
    res.writeHead(200, {'Content-Type': 'image/png'})
    res.end(tile)
    return
  } catch(e) {}
  try {
    const result = await renderQueue.push(x, y, z)
    if (result) {
      const image = await fs.readFile(path.resolve(cacheDirectory, String(z), String(x) , String(y) + '.png'))
      res.writeHead(200, {'Content-Type': 'image/png'})
      res.end(image)
      return
    } else {
      res.writeHead(500, {'Content-Type': 'text/plain'})
      res.end('Server error 500')
      return
    }
  } catch(e) {
    console.error('Error response tile')
    console.error(e)
    res.writeHead(500, {'Content-Type': 'text/plain'})
    if (DEBUG) res.end(e.message)
    else res.end('Server error 500')
    return
  }
})

async function main() {
  try {
    await fs.access(path.resolve(cacheDirectory), fsSync.constants.F_OK)
  } catch(e) {
    console.error(e)
    console.error('ERROR: Error access to cacheDir', cacheDirectory)
    process.exit(1)
  }
  try {
    await renderQueue.loading()
    renderQueue.start()
  } catch(e) {
    console.error('ERROR: Error loading stylesheet to mapnik')
    console.error(e)
    process.exit(1)
  }
}

main().then(() => {
  app.listen(port, () => {
    console.log(`Tile server start http://localhost:${port}`)
  })
})
