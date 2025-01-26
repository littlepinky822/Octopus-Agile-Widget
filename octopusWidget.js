// Tariff Variables
const tariffKey = "AGILE-24-10-01" // Agile Octopus October 2024 v1
const tariffType = "electricity" // electricity or gas
const regionCode = "J" // Change to your region code, see https://www.guylipman.com/octopus/formulas.html
const baseUrl = `https://api.octopus.energy/v1/products/${tariffKey}/`
const tariffCode = `${tariffType[0].toUpperCase()}-1R-${tariffKey}-${regionCode}`; // eg. E-1R-AGILE-24-10-01-J

// Account details
// You can get these information from https://octopus.energy/dashboard/new/accounts/personal-details/api-access
const accountId = "<YourAccountId>";
const apiKey = "<YourApiKey>";
const MPAN = "<YourMPAN>";
const serialNumber = "<YourSerialNumber>";

// Create an empty widget
async function createWidget() {
    let listwidget = new ListWidget();

    listwidget.backgroundColor = new Color("#100030");
    listwidget.addSpacer(20);
    let heading = listwidget.addText("Agile Octopus")
    heading.centerAlignText();
    heading.font = Font.boldSystemFont(16);
    heading.textColor = new Color("#ffffff");

    listwidget.addSpacer(10);

    return listwidget;
}

let widget = await createWidget();

async function getAuthToken() {
    const url = `https://api.octopus.energy/v1/accounts/${accountId}/`
    const headers = { 'Authorization': `Basic ${apiKey}` };
    const response = await new Request(url, { header: headers }).loadJSON();
    return response.auth_token;
}

// Helper function to check if current date is within BST period
function isBST(date) {
    const marchLastSunday = new Date(date.getFullYear(), 2, 31);
    marchLastSunday.setDate(31 - (marchLastSunday.getDay() + 1) % 7);
    const octoberLastSunday = new Date(date.getFullYear(), 9, 31);
    octoberLastSunday.setDate(31 - (octoberLastSunday.getDay() + 1) % 7);

    return date > marchLastSunday && date < octoberLastSunday;
}

// Helper function to get the time frame for the price query (current and next half-hour)
function getQueryTime(today) {
    const [hour, minute, second] = today.toLocaleTimeString().split(":").map(Number)
    const isHour23 = hour === 23;
    const isFirstHalf = minute < 30;

    // Format the start time based on whether we're in first or second half of hour
    const periodFrom = `${hour}:${isFirstHalf ? '00' : '30'}:00`;

    // Format the end time
    let periodTo;
    if (isHour23 && isFirstHalf) {
        periodTo = "23:59:59";
    } else if (isHour23 && !isFirstHalf) {
        periodTo = "00:29:59";
    } else {
        const nextHour = (hour + 1).toString().padStart(2, '0');
        periodTo = `${nextHour}:${isFirstHalf ? '59' : '29'}:59`;
    }

    return { periodFrom, periodTo };
}

// Helper function to format dates as YYYY-MM-DD
function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Adjusted function to fetch tariff data for electricity or gas with BST consideration
async function fetchTariffData() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Get the time frame for price query
    const { periodFrom, periodTo } = getQueryTime(today);
    if (periodFrom == "23:30:00") {
        var urlToday = `${baseUrl}${tariffType}-tariffs/${tariffCode}/standard-unit-rates/?period_from=${formatDate(today)}T${periodFrom}Z&period_to=${formatDate(tomorrow)}T${periodTo}Z`;
    } else {
        var urlToday = `${baseUrl}${tariffType}-tariffs/${tariffCode}/standard-unit-rates/?period_from=${formatDate(today)}T${periodFrom}Z&period_to=${formatDate(today)}T${periodTo}Z`;
    }

    let dataNow, dataNextHour;
    try {
        let responseToday = await new Request(urlToday).loadJSON();
        dataNow = responseToday.results[1] ? responseToday.results[1].value_inc_vat.toFixed(2) : "--";
        dataNextHour = responseToday.results[0] ? responseToday.results[0].value_inc_vat.toFixed(2) : "--";
    } catch (error) {
        console.error(`Error fetching tariff data: ${error}`);
        dataNow = "--";
        dataNextHour = "--";
    }

    return { now: dataNow, nextHour: dataNextHour };
}

// Function to fetch electricity consumption data of current and previous day
async function fetchConsumptionData() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // During BST, adjust the period_to to 22:59:59 to account for UTC+1
    let periodToHour = isBST(today) ? "22:59:59" : "23:59:59";

    // const headers = {"Authorization": `Basic ${btoa(`${apiKey}:`)}`};
    const urlToday = `https://api.octopus.energy/v1/electricity-meter-points/${MPAN}/meters/${serialNumber}/consumption/?period_from=${formatDate(today)}T00:00:00Z&period_to=${formatDate(today)}T${periodToHour}Z&group_by=day`;
    const urlYesterday = `https://api.octopus.energy/v1/electricity-meter-points/${MPAN}/meters/${serialNumber}/consumption/?period_from=${formatDate(yesterday)}T00:00:00Z&period_to=${formatDate(yesterday)}T${periodToHour}Z&group_by=day`;

    let dataToday, dataYesterday;
    try {
        let requestToday = await new Request(urlToday);
        requestToday.headers = {
            'Authorization': `Basic ${btoa(`${apiKey}:`)}`
        };
        let responseToday = await requestToday.loadJSON();

        let requestYesterday = await new Request(urlYesterday);
        requestYesterday.headers = {
            'Authorization': `Basic ${btoa(`${apiKey}:`)}`
        };
        let responseYesterday = await requestYesterday.loadJSON();
        
        dataToday = responseToday.results[0] ? responseToday.results[0].consumption.toFixed(2) : "--";
        dataYesterday = responseYesterday.results[0] ? responseYesterday.results[0].consumption.toFixed(2) : "--";
    } catch (error) {
        console.error(`Error fetching consumption data: ${error}`);
        dataToday = "--";
        dataYesterday = "--";
    }

    return { today: dataToday, yesterday: dataYesterday };
}

// Function to display the tariff data on the widget
async function displayTariffData(symbolName) {
    const data = await fetchTariffData();
    let row = widget.addStack();
    row.centerAlignContent();

    const symbol = SFSymbol.named(symbolName);
    symbol.applyMediumWeight();
    const img = row.addImage(symbol.image);
    
    // Set the symbol's color based on the tariff type
    if (tariffType === "electricity") {
        img.tintColor = new Color("#FFD700"); // Yellow for electricity
    } else if (tariffType === "gas") {
        img.tintColor = new Color("#FF4500"); // Fiery orange for gas
    }
    
    // Set the symnol image
    img.imageSize = new Size(30, 30);
    img.resizable = true;
    row.addSpacer(8);

    // Display today's price in a large font
    let priceStack = row.addStack();
    priceStack.centerAlignContent();
    
    let priceNumber = priceStack.addText(data.now);
    priceNumber.font = Font.boldSystemFont(24);
    let priceUnit = priceStack.addText('p');
    priceUnit.font = Font.boldSystemFont(16);

    priceNumber.textColor = Color.white();
    priceUnit.textColor = Color.white();
    widget.addSpacer(4);

    let subText, subElement;
    // Check if tomorrow's price is available and not "N/A"
    if (data.nextHour && data.nextHour !== "--") {
        let change = data.now && data.now !== "--" ? ((parseFloat(data.nextHour) - parseFloat(data.now)) / parseFloat(data.now)) * 100 : 0;
        // Calculate absolute change and format to 2 decimal places for percentage
        let percentageChange = Math.abs(change).toFixed(2) + "%"; 
        // Determine the arrow direction based on price change
        let arrow = change > 0 ? "↑" : (change < 0 ? "↓" : ""); 
        // Place the percentage change before the arrow in the display text
        subText = `Next: ${data.nextHour}p (${percentageChange}${arrow})`; // Adjusted order here
        subElement = widget.addText(subText);
        // Color the text based on price change direction
        subElement.textColor = change > 0 ? new Color("#FF3B30") : (change < 0 ? new Color("#30D158") : Color.white());
        subElement.font = Font.systemFont(11);
    } else {
        // Display "Coming Soon" if tomorrow's price is not available
        subText = `Next: Coming Soon`;
        subElement = widget.addText(subText);
        subElement.textColor = Color.white();
        subElement.font = Font.systemFont(11);
    }

    widget.addSpacer(10); // Add final spacer for layout
}

async function displayConsumptionData() {
    const data = await fetchConsumptionData();
    
    let row = widget.addStack();
    row.centerAlignContent();

    const symbol = SFSymbol.named("w.circle.fill");
    symbol.applyMediumWeight();
    const img = row.addImage(symbol.image);
    
    // Set the symnol image
    img.imageSize = new Size(30, 30);
    img.resizable = true;
    row.addSpacer(8);

    // Display today's price in a large font
    let consumptionStack = row.addStack();
    consumptionStack.bottomAlignContent();

    let consumptionNumber = consumptionStack.addText(data.yesterday);
    consumptionNumber.font = Font.boldSystemFont(24);
    consumptionNumber.textColor = Color.white();

    let consumptionUnit = consumptionStack.addText('kWh');
    consumptionUnit.font = Font.boldSystemFont(16);
    consumptionUnit.textColor = Color.white();
    widget.addSpacer(4);

    let subText, subElement;
    // Check if yesterday's consumption is available and not "--"
    if (data.yesterday && data.yesterday !== "--") {
        subText = "USED Yesterday";
        subElement = widget.addText(subText);
        // Color the text based on price change direction
        subElement.textColor = Color.white();
        subElement.font = Font.systemFont(11);
    } else {
        // Display "Coming Soon" if yesterday's price is not available
        subText = `USED: Coming Soon`;
        subElement = widget.addText(subText);
        subElement.textColor = Color.white();
        subElement.font = Font.systemFont(11);
    }

    widget.addSpacer(20); // Add final spacer for layout
}

// Display tariff information for electricity and gas
await displayTariffData("bolt.fill");
await displayConsumptionData();

// Check where the script is running
if (config.runsInWidget) {
    // Runs inside a widget so add it to the homescreen widget
    Script.setWidget(widget);
} else {
    // Preview a small widget inside the app
    widget.presentSmall();
}
Script.complete();