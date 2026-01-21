cmake_minimum_required(VERSION 3.20)

project(luau-docgen LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(LUAU_DOCGEN_LUAU_DIR "" CACHE PATH "Path to Luau source")

set(LUAU_DOCGEN_LUAU_VERSION_FILE "${CMAKE_CURRENT_LIST_DIR}/luau.version")
set(LUAU_DOCGEN_LUAU_TAG "master")
if(EXISTS "${LUAU_DOCGEN_LUAU_VERSION_FILE}")
  file(READ "${LUAU_DOCGEN_LUAU_VERSION_FILE}" LUAU_DOCGEN_LUAU_TAG)
  string(STRIP "${LUAU_DOCGEN_LUAU_TAG}" LUAU_DOCGEN_LUAU_TAG)
endif()

if(LUAU_DOCGEN_LUAU_DIR)
  add_subdirectory(${LUAU_DOCGEN_LUAU_DIR} ${CMAKE_BINARY_DIR}/luau)
else()
  include(FetchContent)
  FetchContent_Declare(
    luau
    GIT_REPOSITORY https://github.com/luau-lang/luau.git
    GIT_TAG ${LUAU_DOCGEN_LUAU_TAG}
  )
  FetchContent_MakeAvailable(luau)
endif()

add_executable(luau-docgen src/main.cpp)

target_link_libraries(luau-docgen PRIVATE Luau.Ast Luau.Common Luau.Config)
