# chezbob-bobolith

Instructions to set up bobolith on fresh server:

```
1. Install initial dependencies
sudo apt-get update
sudo apt install git curl git-core gcc make zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev libssl-dev postgresql libpq-dev python3-dev

2. Clone this repo 
git clone https://github.com/chezbob/chezbob-bobolith.git
# And enter it
cd chezbob-bobolith/

3. Install python and related tools
# First python & pip
sudo apt-get -y install python3-pip

# And now, pyenv
git clone https://github.com/pyenv/pyenv.git ~/.pyenv

echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc
echo 'export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc
echo -e 'if command -v pyenv 1>/dev/null 2>&1; then\n eval "$(pyenv init -)"\nfi' >> ~/.bashrc
source ~/.bashrc

# And now pipenv
pip install pipenv

4. Install postgres
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -\n
sudo apt-get install postgresql
sudo apt-get install postgresql-12

5. Configure postgres
# Enter postgres shell
sudo -i -u postgres

# Create the bobolith role 
createuser --interactive --pwprompt

# With responses: (ask chezbob admin about password)
Enter name of role to add: bobolith
Enter password for new role: 
Enter it again: 
Shall the new role be a superuser? (y/n) n
Shall the new role be allowed to create databases? (y/n) n
Shall the new role be allowed to create more new roles? (y/n) n

# Enter psql
psql

# Create bobolith database
CREATE DATABASE bobolith WITH OWNER=bobolith; 

# And exit 
\q
exit

6. Configure project
# install python dependencies
pipenv sync
# And enter the virtualenv
pipenv shell
# and migrate
python manage.py migrate
# and start it! 
python manage.py runserver
```

