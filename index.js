 
const express = require('express')
const app = express()
const { parseXYZ } = require('./utils')
const {Pool} = require('./pool')

const port = 3000
const pool = new Pool()

app.get('/:x/:y/:z', async (req, res) => {
  const [x, y, z] = parseXYZ(req)
  if (!x || !y || !y) {
    console.error('No x, y, z provided')
    res.writeHead(500, {
      'Content-Type': 'text/plain'
    })
    res.end('No x,y,z provided')
    return
  }
  try {
    const tile = await pool.add(x, y, z)
    res.writeHead(200, {
      'Content-Type': 'image/png'
    })
    res.end(tile)
    return
  } catch(e) {
    console.error(e)
    res.writeHead(500, {
      'Content-Type': 'text/plain'
    })
    res.end(e.message)
    return
  }
})

async function main() {
  await pool.load()
  pool.start()
}

main().then(() => {
  app.listen(port, () => {
    console.log(`Tile server start http://localhost:${port}`)
  })
})
