
Example tiles
![screenshot](https://raw.github.com/izhastron/node_tile_server/main/images/city.png)

Cold render without cache
threads = 8, metaTileSize = 1024, store ssd
![screenshot](https://raw.github.com/izhastron/node_tile_server/main/images/render.png)

How it works?
1) To start, you need to install the mapnik dynamic library and the osm2pgsql utility
2) Clone the repository and install the npm install packages
3) It is necessary to download a file with geodata in pbf format
4) Adjust the config.json file to suit your parameters
5) Run the initial boot script: npm run bootstrap path_to_file.pbf
6) Start the server: npm run start
7) The project has an index.html file for checking the map

How run in docker?
1) Copy data.pbf to docker folder
2) Change working directory to docker
3) Run docker build ./ -t tag_name
4) Run container docker run -p 3000:3000 -t tag_name
5) Go to page http://127.0.0.1:3000/

How to tune performance?

The main load is caused by the rendering of tiles and queries to the database
The size of the meta tile must be 2 times larger than the size of a regular tile, i.e. 1, 2, 4, 8 times larger

1) Large meta tile size, increases the load on the render
2) Large meta tile size, reduces the load on database queries
3) The more threads, the faster the tiles are rendered, but the load on the render and database queries increases
4) When changing threads and size, observe the load in htop and select the optimal

To prepare the styles, the code was used https://github.com/gravitystorm/openstreetmap-carto.
Thanks to them for providing the template engine.