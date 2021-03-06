module.exports.parseXYZ = function(req) {
  const matches = req.url.match(/(\d+)/g)
  if (matches && matches.length == 3) {
    try {
      const x = parseInt(matches[1], 10)
      const y = parseInt(matches[2], 10)
      const z = parseInt(matches[0], 10)
      return [x, y, z]
    } catch(e) {
      console.error(e)
      return []
    }
  } else return []
}

module.exports.sleep = function(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), ms)
  })
}