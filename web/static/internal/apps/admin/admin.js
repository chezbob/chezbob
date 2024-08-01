async function addUsers(ev) {   

    ev.preventDefault();
 
    // TODO get + format emails
    var emails = document.getElementById('emails').value;
    //let response = await fetch("/api/addusers?emails=" + emails);
    let response = await fetch("/api/wos/totaldebt");
    let content = document.getElementById("content");    

    try {
        let userData = await response.json();
        if (userData.length == 0) {
            throw "Error adding user";
        }
        content.innerHTML = 
        `<div id="message">
        Successfully added users
        </div>` ;
        // TODO map emails to user
    } catch (e) {
        content.innerHTML = 
        `<div id="message">
        Could not add user ` + emails + `.
        </div>`;
    } 
} 

document.getElementById("form").addEventListener("submit", addUsers);
