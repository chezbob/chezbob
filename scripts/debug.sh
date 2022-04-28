#!/bin/bash
export DEBUG=true;
export RELAY_SERVER='ws://localhost:8080/'
tmux new-session -d -s chezbob "DEPLOYMENT_MODE='development' HTTP_PORT=8080 node app-server";
tmux split-window;
tmux send "SERVICE_IDENT='barcode' DESTINATION_IDENT='pos' RELAY_SERVER=$RELAY_SERVER node scripts/debug_barcode" ENTER;
tmux split-window;
tmux send "SERVICE_IDENT='cash' DESTINATION_IDENT='pos' RELAY_SERVER=$RELAY_SERVER node scripts/debug_cash" ENTER;
tmux split-window;
tmux send "DEPLOYMENT_MODE='development' RELAY_SERVER=$RELAY_SERVER node inventory" ENTER;
tmux select-layout main-vertical;
tmux set -g mouse on;
tmux a;

