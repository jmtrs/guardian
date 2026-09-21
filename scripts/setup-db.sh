#!/bin/bash
sudo pg_ctlcluster 16 main start 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo pg_lsclusters