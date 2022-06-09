const REFRESH_INTERVAL = 60 * 60 * 1000; // One hour in milliseconds

async function displayPopular() {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const isoDate = oneMonthAgo.toISOString().substring(0,10);
    let response = await fetch("/api/popular?from=" + isoDate);
    let content = document.getElementById("content");
    try {
        let itemsData = await response.json();
        if (itemsData.length == 0) {
            throw "No item in popular";
        }
        const tableContent = itemsData.map(({item_count, name}) => {
            return (
                `<tr>
                    <td>${item_count}</td>
                    <td>${name}</td>
                </tr>`);
        });
        const tableHeader = `<tr>
        <th>Times Purchased</th>
        <th>Item Name</th>
        </tr>`;
        const table = `<table>${tableHeader}${tableContent.join("")}</table>`;
        content.innerHTML = table;
    } catch (e) {
        content.innerHTML =
            `<div id="message">
            No recent purchases.
            <br/>
            Support your local Bob!</div>`;
    }
}

// display popular info when loading the page
displayPopular();

// refresh the wall
setInterval(displayPopular, REFRESH_INTERVAL); //ms