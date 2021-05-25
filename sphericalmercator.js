const mapnik = require('mapnik')
const { tileSize } = require('./config.json')
const proj4 = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over';
const mercator = new mapnik.Projection(proj4)

function SphericalMercator() {
    let size = tileSize
    this.Bc = []
    this.Cc = []
    this.Zc = []
    this.RAD_TO_DEG = 180 / Math.PI
    this.size = tileSize
    for (let d = 0; d < 99; d++) {
        this.Bc.push(size / 360)
        this.Cc.push(size / (2 * Math.PI))
        this.Zc.push(size / 2)
        size *= 2
    }
}
SphericalMercator.prototype.pxTolatlon = function([x, y], zoom) {
    const zoomDenominator = this.Zc[zoom]
    const g = (y - zoomDenominator) / (-this.Cc[zoom])
    const lat = (x - zoomDenominator) / this.Bc[zoom]
    const lon = this.RAD_TO_DEG * (2 * Math.atan(Math.exp(g)) - 0.5 * Math.PI)
    return [lat, lon]
}
SphericalMercator.prototype.xyzToEnvelope = function(x, y, zoom) {
    const upPx = [x * this.size, (y + 1) * this.size]
    const downPx = [(x + 1) * this.size, y * this.size]
    const bbox = this.pxTolatlon(upPx, zoom).concat(this.pxTolatlon(downPx, zoom))
    return mercator.forward(bbox)
}

module.exports = new SphericalMercator()

