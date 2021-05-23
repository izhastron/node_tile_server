How it works?
1) To start, you need to install the mapnik dynamic library and the osm2pgsql utility
2) Clone the repository and install the npm install packages
3) It is necessary to download a file with geodata in pbf format
4) Adjust the config.json file to suit your parameters
5) Run the initial boot script: npm run bootstrap path_to_file.pbf
6) Start the server: npm run start
7) The project has an index.html file for checking the map