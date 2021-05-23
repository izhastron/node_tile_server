const path = require('path')
const fs = require('fs').promises
const STYLE_OUTPUT = 'style.xml'

async function main() {
  const stylesheet = await fs.readFile(path.join(__dirname, STYLE_OUTPUT), 'utf8')
  const regexp = new RegExp(`<Layer[\\s\\S]+?name=\"necountries\"[\\s\\S]+?[\\s\\S]+?</Layer>`, 'gi')
  console.log(stylesheet.match(regexp))
}

main()