FROM alpine:3.18 AS builder

RUN apk add --no-cache \
    g++ \
    cmake \
    make \
    sqlite-dev \
    git \
    openssl-dev \
    curl-dev \
    linux-headers

WORKDIR /app
COPY . .

WORKDIR /app/build
RUN cmake -DCMAKE_BUILD_TYPE=Release .. && make -j$(nproc)

FROM alpine:3.18
RUN apk add --no-cache libgcc libstdc++ sqlite-libs openssl libcurl
WORKDIR /app
COPY --from=builder /app/build/destek_api /app/destek_api

EXPOSE 8080
VOLUME /app/data

CMD ["./destek_api", "/app/data/destek_mau.db"]
