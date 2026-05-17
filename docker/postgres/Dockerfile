# syntax=docker/dockerfile:1.7
FROM postgres:16-bookworm AS build

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates git \
      autoconf automake libtool m4 pkg-config \
      postgresql-server-dev-16 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Build SCWS to /usr/local — zhparser's Makefile hardcodes
#   -I/usr/local/include/scws  and  -L/usr/local/lib
RUN git clone --depth 1 --branch 1.2.3 https://github.com/hightman/scws.git \
 && cd scws \
 && touch NEWS README AUTHORS ChangeLog \
 && (test -x ./configure || autoreconf -fiv) \
 && ./configure --prefix=/usr/local \
 && make -j"$(nproc)" \
 && make install \
 && ldconfig

# Build zhparser Postgres extension against the libscws we just installed.
RUN git clone --depth 1 https://github.com/amutu/zhparser.git \
 && cd zhparser \
 && make USE_PGXS=1 \
 && make USE_PGXS=1 install


FROM postgres:16-bookworm

# libscws shared library (includes SONAME symlinks)
COPY --from=build /usr/local/lib/libscws.so*  /usr/local/lib/
# zhparser PG extension files
COPY --from=build /usr/lib/postgresql/16/lib/zhparser.so       /usr/lib/postgresql/16/lib/zhparser.so
COPY --from=build /usr/share/postgresql/16/extension/zhparser* /usr/share/postgresql/16/extension/
COPY --from=build /usr/share/postgresql/16/tsearch_data/       /usr/share/postgresql/16/tsearch_data/

# Ensure /usr/local/lib is in the dynamic linker cache so PG can resolve libscws when loading zhparser.so
RUN echo "/usr/local/lib" > /etc/ld.so.conf.d/usr-local.conf && ldconfig
