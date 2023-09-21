#!/usr/bin/env bash

# start container (remove everything on shutdown)
docker compose -f docker-compose.yml up
docker compose -f docker-compose.yml rm -fsv
