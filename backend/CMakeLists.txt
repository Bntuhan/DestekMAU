cmake_minimum_required(VERSION 3.16)
project(destek_mau_api CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

set(JWT_BUILD_EXAMPLES OFF CACHE BOOL "")
set(JWT_DISABLE_PICOJSON ON CACHE BOOL "")

FetchContent_Declare(
  nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
)
FetchContent_MakeAvailable(nlohmann_json)

FetchContent_Declare(
  httplib
  URL https://github.com/yhirose/cpp-httplib/archive/refs/tags/v0.18.3.tar.gz
)
FetchContent_MakeAvailable(httplib)

set(nlohmann_json_DIR ${nlohmann_json_SOURCE_DIR})

FetchContent_Declare(
  jwt-cpp
  URL https://github.com/Thalhammer/jwt-cpp/archive/refs/tags/v0.7.0.tar.gz
)
FetchContent_MakeAvailable(jwt-cpp)

find_package(SQLite3 REQUIRED)
find_package(OpenSSL REQUIRED)

add_executable(destek_api src/main.cpp)
target_include_directories(destek_api PRIVATE ${httplib_SOURCE_DIR})
target_link_libraries(destek_api PRIVATE 
    nlohmann_json::nlohmann_json 
    SQLite::SQLite3 
    jwt-cpp::jwt-cpp 
    OpenSSL::SSL 
    OpenSSL::Crypto
)
