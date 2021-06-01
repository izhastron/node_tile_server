 
const express = require('express')
const fs = require('fs').promises
const path = require('path')
const { parseXYZ } = require('./src/utils')
const renderPool = require('./src/pool')
const config = require('./config')
const logger = require("log4js").getLogger("tile_server")
const app = express()
const port = 3000

app.get('/', async (req, res) => {
  try {
    const page = await fs.readFile(path.resolve(__dirname, 'assets', 'pages', 'index.html'))
    res.writeHead(500, {'Content-Type': 'text/html'})
    return res.end(page)
  } catch(e) {
    logger.error(e)
    res.writeHead(500, {'Content-Type': 'text/plain'})
    if (config.isDebug) return res.end(e.message)
    else return res.end('Server error 500')
  }
})

app.get('/:x/:y/:z', async (req, res) => {
  const [x, y, z] = parseXYZ(req)

  if ([x, y, z].includes(undefined)) {
    logger.debug('Error parse x, y, z in ' + req.url)
    res.writeHead(500, {'Content-Type': 'text/plain'})
    return res.end('Error parse x, y, z')
  }

  if (config.cache.enable) {
    try {
      const tile = await fs.readFile(path.resolve(config.cache.directory, [z, x, y].join('/') + '.png'))
      res.writeHead(200, {'Content-Type': 'image/png'})
      return res.end(tile)
    } catch(e) {
      logger.debug('Not find cache file ' + path.resolve(config.cache.directory, [z, x, y].join('/') + '.png'))
    }
  }
  
  try {
    logger.debug(`Request to render tile x:${x} y:${y} z:${z}`)
    const tile = await renderPool.push(x, y, z)
    res.writeHead(200, {'Content-Type': 'image/png'})
    return res.end(tile)
  } catch(e) {
    logger.debug(`Failed render tile x:${x} y:${y} z:${z}`)
    logger.error(e)
    res.writeHead(500, {'Content-Type': 'text/plain'})
    if (config.isDebug) return res.end(e.message)
    else return res.end('Server error 500')
  }
})

async function main() {
  logger.info('Loading stylesheet to mapnik...')
  try {
    await renderPool.loading()
    logger.debug('Loading stylesheet to mapnik succes')
  } catch(e) {
    logger.fatal(e)
    process.exit(1)
  }
}

main().then(() => {
  app.listen(config.server.port, config.server.address, 
    () => logger.info(`Tile server start on http://${config.server.address}:${config.server.port}`)
  )
}).catch((e) => {
  logger.fatal(e)
  process.exit(1)
})
