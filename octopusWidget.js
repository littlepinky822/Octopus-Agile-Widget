// Configuration Constants
const CONFIG = {
    // Tariff Settings
    tariff: {
        key: "AGILE-24-10-01",  // Agile Octopus October 2024 v1
        type: "electricity",
        regionCode: "J",  // See https://www.guylipman.com/octopus/formulas.html
    },
    // API Settings
    api: {
        // You can get these information from https://octopus.energy/dashboard/new/accounts/personal-details/api-access
        baseUrl: "https://api.octopus.energy/v1/products/",
        accountId: "A-3F2D43B6",
        apiKey: "sk_live_XoChk3KPhJscckbjPoJXhQq3",
        MPAN: "1900091748210",
        serialNumber: "24E8057881"
    },
    // Widget Style
    style: {
        backgroundColor: new Color("#100030"),
        textColor: new Color("#ffffff"),
        electricityColor: new Color("#FFD700"),
        priceIncreaseColor: new Color("#FF3B30"),
        priceDecreaseColor: new Color("#30D158")
    }
};

// Compute derived constants
const tariffCode = `${CONFIG.tariff.type[0].toUpperCase()}-1R-${CONFIG.tariff.key}-${CONFIG.tariff.regionCode}`;   // eg. E-1R-AGILE-24-10-01-J
const baseUrl = `${CONFIG.api.baseUrl}${CONFIG.tariff.key}/`;

// Helper Functions
function isBST(date) {
    const marchLastSunday = new Date(date.getFullYear(), 2, 31);
    marchLastSunday.setDate(31 - (marchLastSunday.getDay() + 1) % 7);
    const octoberLastSunday = new Date(date.getFullYear(), 9, 31);
    octoberLastSunday.setDate(31 - (octoberLastSunday.getDay() + 1) % 7);

    return date > marchLastSunday && date < octoberLastSunday;
}

function getQueryTime(today) {
    const [hour, minute, second] = today.toLocaleTimeString().split(":").map(Number)
    const isHour23 = hour === 23;
    const isFirstHalf = minute < 30;

    const periodFrom = `${hour}:${isFirstHalf ? '00' : '30'}:00`;

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

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// API functions
// Adjusted function to fetch tariff data for electricity or gas with BST consideration
async function fetchTariffData() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Get the time frame for price query
    const { periodFrom, periodTo } = getQueryTime(today);
    if (periodFrom == "23:30:00") {
        var urlToday = `${baseUrl}${CONFIG.tariff.type}-tariffs/${tariffCode}/standard-unit-rates/?period_from=${formatDate(today)}T${periodFrom}Z&period_to=${formatDate(tomorrow)}T${periodTo}Z`;
    } else {
        var urlToday = `${baseUrl}${CONFIG.tariff.type}-tariffs/${tariffCode}/standard-unit-rates/?period_from=${formatDate(today)}T${periodFrom}Z&period_to=${formatDate(today)}T${periodTo}Z`;
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

    const urlToday = `https://api.octopus.energy/v1/electricity-meter-points/${CONFIG.api.MPAN}/meters/${CONFIG.api.serialNumber}/consumption/?period_from=${formatDate(today)}T00:00:00Z&period_to=${formatDate(today)}T${periodToHour}Z&group_by=day`;
    const urlYesterday = `https://api.octopus.energy/v1/electricity-meter-points/${CONFIG.api.MPAN}/meters/${CONFIG.api.serialNumber}/consumption/?period_from=${formatDate(yesterday)}T00:00:00Z&period_to=${formatDate(yesterday)}T${periodToHour}Z&group_by=day`;

    let dataToday, dataYesterday;
    try {
        let requestToday = await new Request(urlToday);
        requestToday.headers = {
            'Authorization': `Basic ${btoa(`${CONFIG.api.apiKey}:`)}`
        };
        let responseToday = await requestToday.loadJSON();

        let requestYesterday = await new Request(urlYesterday);
        requestYesterday.headers = {
            'Authorization': `Basic ${btoa(`${CONFIG.api.apiKey}:`)}`
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

// Widget UI Functions
async function createWidget() {
    let widget = new ListWidget();

    widget.backgroundColor = new Color("#100030");
    widget.addSpacer(20);
    let heading = widget.addText("Agile Octopus")
    heading.centerAlignText();
    heading.font = Font.boldSystemFont(16);
    heading.textColor = new Color("#ffffff");

    widget.addSpacer(10);
    return widget;
}

async function displayTariffData(widget, symbolName) {
    const data = await fetchTariffData();
    let row = widget.addStack();
    row.centerAlignContent();

    const symbol = SFSymbol.named(symbolName);
    symbol.applyMediumWeight();
    const img = row.addImage(symbol.image);
    img.tintColor = new Color("#FFD700");
    
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
    // Check if tomorrow's price is available and not "--"
    // Calculate the percentage change and the arrow direction
    if (data.nextHour && data.nextHour !== "--") {
        let change = data.now && data.now !== "--" ? ((parseFloat(data.nextHour) - parseFloat(data.now)) / parseFloat(data.now)) * 100 : 0;
        let percentageChange = Math.abs(change).toFixed(2) + "%"; 
        let arrow = change > 0 ? "↑" : (change < 0 ? "↓" : ""); 
        subText = `Next: ${data.nextHour}p (${percentageChange}${arrow})`;
        subElement = widget.addText(subText);
        subElement.textColor = change > 0 ? new Color("#FF3B30") : (change < 0 ? new Color("#30D158") : Color.white());
        subElement.font = Font.systemFont(11);
    } else {
        // Display "Coming Soon" if tomorrow's price is not available
        subText = `Next: Coming Soon`;
        subElement = widget.addText(subText);
        subElement.textColor = Color.white();
        subElement.font = Font.systemFont(11);
    }

    widget.addSpacer(10);
}

async function displayConsumptionData(widget) {
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
        subElement.textColor = Color.white();
        subElement.font = Font.systemFont(11);
    } else {
        // Display "Coming Soon" if yesterday's price is not available
        subText = `USED: Coming Soon`;
        subElement = widget.addText(subText);
        subElement.textColor = Color.white();
        subElement.font = Font.systemFont(11);
    }

    widget.addSpacer(20);
}

// Main
async function main() {
    const widget = await createWidget();
    await displayTariffData(widget, "bolt.fill");
    await displayConsumptionData(widget);

    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else {
        widget.presentSmall();
    }
    Script.complete();
}

await main();
