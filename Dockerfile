FROM node:17

EXPOSE 8080

RUN apt-get update && apt-get install -y bash tmux
RUN mkdir /home/chezbob
COPY . /home/chezbob
WORKDIR /home/chezbob
RUN npm run setup
