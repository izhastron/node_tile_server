FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8
RUN apt-get update
RUN apt-get install locales -y --no-install-recommends
RUN locale-gen en_US.UTF-8
RUN echo 'LANGUAGE="en_US.UTF-8"' >> /etc/default/locale
RUN echo 'LC_ALL="en_US.UTF-8"' >> /etc/default/locale
RUN apt install unzip wget postgresql postgis postgresql-12-postgis-3 git osm2pgsql npm sudo build-essential -y --no-install-recommends
RUN npm install -g n
RUN n 16
RUN mkdir -p /opt/tile_server
WORKDIR /opt/tile_server
RUN wget https://github.com/izhastron/node_tile_server/archive/refs/heads/main.zip -O archive.zip
RUN unzip archive.zip -d ./
RUN cp -R node_tile_server-main/* ./
RUN rm -rf archive.zip ./node_tile_server-main
RUN npm install
RUN mkdir -p /var/cache/tile
COPY ./config.json /opt/tile_server/config.json
COPY ./data.pbf /opt/tile_server/data.pbf
COPY ./pg_hba.conf /etc/postgresql/12/main/pg_hba.conf
COPY ./postgresql.conf /etc/postgresql/12/madin/postgresql.conf
RUN pg_ctlcluster 12 main --skip-systemctl-redirect start && npm run init -- --file=data.pbf -y && pg_ctlcluster 12 main --skip-systemctl-redirect stop
RUN rm -rf /opt/tile_server/data.pbf
CMD [ "/bin/bash", "-c", "/usr/bin/pg_ctlcluster 12 main --skip-systemctl-redirect start && /usr/local/bin/node /opt/tile_server/index.js && pg_ctlcluster 12 main --skip-systemctl-redirect stop" ]
EXPOSE 3000