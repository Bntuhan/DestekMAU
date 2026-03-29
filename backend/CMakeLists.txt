cmake_minimum_required(VERSION 3.16)
project(destek_mau_api CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

FetchContent_Declare(
  json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
  GIT_SHALLOW ON
)
FetchContent_MakeAvailable(json)

FetchContent_Declare(
  httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.18.3
  GIT_SHALLOW ON
)
FetchContent_GetProperties(httplib)
if(NOT httplib_POPULATED)
  FetchContent_Populate(httplib)
endif()

find_package(SQLite3 REQUIRED)

add_executable(destek_api src/main.cpp)
target_include_directories(destek_api PRIVATE ${httplib_SOURCE_DIR})
target_link_libraries(destek_api PRIVATE nlohmann_json::nlohmann_json SQLite::SQLite3)
