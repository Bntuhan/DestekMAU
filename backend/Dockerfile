FROM alpine:3.18 AS builder

RUN apk add --no-cache \
    g++ \
    cmake \
    make \
    postgresql-dev \
    git \
    openssl-dev \
    curl-dev \
    linux-headers

WORKDIR /app
COPY . .

WORKDIR /app/build
RUN cmake -DCMAKE_BUILD_TYPE=Release .. && make

FROM alpine:3.18
RUN apk add --no-cache libgcc libstdc++ libpq openssl libcurl
WORKDIR /app
COPY --from=builder /app/build/destek_api /app/destek_api

ENV DATABASE_URL="postgresql://postgres:Nb011206.,.,-@db.mmlpahjnzxhrbjfeevyu.supabase.co:5432/postgres"

EXPOSE 8080

CMD ["./destek_api"]
