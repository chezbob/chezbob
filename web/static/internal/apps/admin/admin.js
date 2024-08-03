// TODO make html prettier
// TODO when creating users, only show add/conf lists if nonempty
// TODO add option to charge item by name or id
// TODO checkbox to make the charge positive or negative (refund)

async function addUsers(ev) {   

    ev.preventDefault();
 
    var emails = document.getElementById('emails').value;
    let response = await fetch("/api/addusers?emails=" + emails);
    let content = document.getElementById("content");    

    try {
        var userData = await response.json();
        console.log(userData);
        if (userData.length == 0) {
            throw "Error adding user, received no data from API";
        }
    
        var added = userData['added'];
        var conflicts = userData['conflicts'];

        const addedContent = added.map(email => {
            return (`<li>${email}</li>`);
        });
        const conflictsContent = conflicts.map(email => {
            return (`<li>${email}</li>`);
        });

        content.innerHTML = 
        `<div id="message">
        Successfully added ${added.length} users: 
        <ul>
            ${addedContent.join("")}
        </ul>
        Skipped ${conflicts.length} conflicting users: 
        <ul>
            ${conflictsContent.join("")} 
        </ul>
        </div>` ;
    } catch (e) {
        console.error(e);
        content.innerHTML = 
        `<div id="message">
        Error adding emails, check the developer console.
        </div>`;
    } 
} 

async function resetPassword(ev) {
    
    ev.preventDefault();

    var email = document.getElementById('resetEmail').value;
    let response = await fetch("/api/resetpassword?email=" + email);
    let content = document.getElementById("content");    

    try {
        var itemData = await response.json();
        console.log(itemData);
        if (itemData.length == 0) {
            throw "Error adding user, received no data from API";
        }

        //TODO finish content
        content.innerHTML = 
        `<div id="message">
            Yes
        </div>` ;
    } catch (e) {
        console.error(e);
        content.innerHTML = 
        `<div id="message">
            No
        </div>`;
    } 
}

async function chargeItem(ev) {
    
    ev.preventDefault();

    var email = document.getElementById('chargeEmail').value;
    var query = document.getElementById('query').value;
    let itemResponse = await fetch("/api/searchinventory?query=" + query);
    let content = document.getElementById("content");    

    try {
        var itemData = await itemResponse.json();
        console.log(itemData);
        if (itemData.length == 0) {
            throw "Error adding user, received no data from API";
        }

        //TODO finish content
        content.innerHTML = 
        `<div id="message">
            Yes
        </div>` ;
    } catch (e) {
        console.error(e);
        content.innerHTML = 
        `<div id="message">
            No
        </div>`;
    } 
}

document.getElementById("add_user").addEventListener("submit", addUsers);
document.getElementById("reset_password").addEventListener("submit", resetPassword);
document.getElementById("charge_item").addEventListener("submit", chargeItem);
