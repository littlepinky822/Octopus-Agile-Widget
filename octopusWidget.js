// Configuration Constants
// You might need to change the following variables to get the correct tariff for your account
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
        apiKey: "<YourApiKey>",
        MPAN: "<YourMPAN>",
        serialNumber: "<YourSerialNumber>"
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
    const isHour00 = hour === 0o0;
    const isFirstHalf = minute < 30;
    
    const normalHalfHour = isFirstHalf ? hour - 1 : hour;
    let periodFrom;
    let lastDay = false;
    // (Current 23:29:59) 23:00:00 - 01:59:59 | (Current 00:00:00) 23:30:00 - 02:29:59
    if (isHour00 && isFirstHalf) {
        periodFrom = "23:30:00";
        lastDay = true;
    } else {
        periodFrom = `${normalHalfHour}:${isFirstHalf ? '30' : '00'}:00`;
    }

    // Range from -0.5hr to +2.5hr (total 3hr)
    // Special cases across midnight: 21:29:59 - 00:29:59 | 22:00:00 - 00:59:59 | 22:29:59 - 01:29:59 | 23:00:00 - 01:59:59 | 23:29:59 - 02:29:59
    // isFirstHalf ? hour +2 : hour +3
    let periodTo;
    let nextDay = false;
    if (hour >= 22 && hour <= 23) {
        if (hour === 22) {
            // 21:29:59 - 00:29:59 | 22:00:00 - 00:59:59
            periodTo = isFirstHalf ? "00:29:59" : "00:59:59";
        } else if (hour === 23) {
            // 22:29:59 - 01:29:59 | 23:00:00 - 01:59:59
            periodTo = isFirstHalf ? "01:29:59" : "01:59:59";
        }
        nextDay = true;
    } else {
        const nextHour = (hour + 2).toString().padStart(2, '0');
        periodTo = `${nextHour}:${isFirstHalf ? '29' : '59'}:59`;
    }

    return { periodFrom, periodTo, lastDay, nextDay };
}

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTimeFromISO(isoString) {
    const date = new Date(isoString);

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    // Return in HH:MM format
    return `${hours}:${minutes}`;
}

// API functions
// Adjusted function to fetch tariff data for electricity or gas with BST consideration
async function fetchTariffData() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Get the time frame for price query
    const { periodFrom, periodTo, lastDay, nextDay } = getQueryTime(today);
    if (nextDay) {
        var urlToday = `${baseUrl}${CONFIG.tariff.type}-tariffs/${tariffCode}/standard-unit-rates/?period_from=${formatDate(today)}T${periodFrom}Z&period_to=${formatDate(tomorrow)}T${periodTo}Z`;
    } else if (lastDay) {
        var urlToday = `${baseUrl}${CONFIG.tariff.type}-tariffs/${tariffCode}/standard-unit-rates/?period_from=${formatDate(yesterday)}T${periodFrom}Z&period_to=${formatDate(today)}T${periodTo}Z`;
    } else {
        var urlToday = `${baseUrl}${CONFIG.tariff.type}-tariffs/${tariffCode}/standard-unit-rates/?period_from=${formatDate(today)}T${periodFrom}Z&period_to=${formatDate(today)}T${periodTo}Z`;
    }
    console.log(urlToday);

    try {
        let responseToday = await new Request(urlToday).loadJSON();
        
        // Create a structured object to store the tariff data
        const tariffData = {
            lastHour: { time: "--", price: "--" },
            now: { time: "--", price: "--" },
            nextHour: { time: "--", price: "--" },
            next2Hours: { time: "--", price: "--" },
            next3Hours: { time: "--", price: "--" },
            next4Hours: { time: "--", price: "--" }
        };
        
        // Map API results to our structure
        const timeSlots = ['next4Hours', 'next3Hours', 'next2Hours', 'nextHour', 'now', 'lastHour'];
        
        timeSlots.forEach((slot, index) => {
            if (responseToday.results[index]) {
                tariffData[slot] = {
                    time: formatTimeFromISO(responseToday.results[index].valid_from),
                    price: responseToday.results[index].value_inc_vat.toFixed(2)
                };
            }
        });
        
        return tariffData;
        
    } catch (error) {
        console.error(`Error fetching tariff data: ${error}`);
        return {
            lastHour: { time: "--", price: "--" },
            now: { time: "--", price: "--" },
            nextHour: { time: "--", price: "--" },
            next2Hours: { time: "--", price: "--" },
            next3Hours: { time: "--", price: "--" },
            next4Hours: { time: "--", price: "--" }
        };
    }
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

async function CreateMediumWidget() {
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

async function displayTariffData(stack, symbolName) {
    const data = await fetchTariffData();
    const row = stack.addStack();
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
    
    let priceNumber = priceStack.addText(data.now.price);
    priceNumber.font = Font.boldSystemFont(24);
    let priceUnit = priceStack.addText('p');
    priceUnit.font = Font.boldSystemFont(16);

    priceNumber.textColor = Color.white();
    priceUnit.textColor = Color.white();
    stack.addSpacer(4);

    let subText, subElement;
    // Check if tomorrow's price is available and not "--"
    // Calculate the percentage change and the arrow direction
    if (data.nextHour.price && data.nextHour.price !== "--") {
        let change = data.now.price && data.now.price !== "--" ? ((parseFloat(data.nextHour.price) - parseFloat(data.now.price)) / parseFloat(data.now.price)) * 100 : 0;
        let percentageChange = Math.abs(change).toFixed(2) + "%"; 
        let arrow = change > 0 ? "↑" : (change < 0 ? "↓" : ""); 
        subText = `Next: ${data.nextHour.price}p (${percentageChange}${arrow})`;
        subElement = stack.addText(subText);
        subElement.textColor = change > 0 ? new Color("#FF3B30") : (change < 0 ? new Color("#30D158") : Color.white());
        subElement.font = Font.systemFont(11);
    } else {
        // Display "Coming Soon" if tomorrow's price is not available
        subText = `Next: Coming Soon`;
        subElement = stack.addText(subText);
        subElement.textColor = Color.white();
        subElement.font = Font.systemFont(11);
    }

    stack.addSpacer(10);
}

async function displayConsumptionData(stack) {
    const data = await fetchConsumptionData();
    const row = stack.addStack();
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
    stack.addSpacer(4);

    let subText, subElement;
    // Check if yesterday's consumption is available and not "--"
    if (data.yesterday && data.yesterday !== "--") {
        subText = "USED Yesterday";
    } else {
        // Display "Coming Soon" if yesterday's price is not available
        subText = `USED: Coming Soon`;
    }
    subElement = stack.addText(subText);
    subElement.textColor = Color.white();
    subElement.font = Font.systemFont(11);

    stack.addSpacer(20);
}

async function displayGraph(stack) {
    let chartStack = stack.addStack();
    chartStack.layoutHorizontally();

    const tariffData = await fetchTariffData();
    const halfHourlyPrices = [
        { hour: tariffData.lastHour.time, price: tariffData.lastHour.price },
        { hour: tariffData.now.time, price: tariffData.now.price },
        { hour: tariffData.nextHour.time, price: tariffData.nextHour.price },
        { hour: tariffData.next2Hours.time, price: tariffData.next2Hours.price },
        { hour: tariffData.next3Hours.time, price: tariffData.next3Hours.price },
        { hour: tariffData.next4Hours.time, price: tariffData.next4Hours.price }
    ];

    const prices = halfHourlyPrices.map(h => parseFloat(h.price) || 0);
    const maxPrice = Math.max(...prices);
    
    // Calculate widths
    const totalBars = halfHourlyPrices.length;
    const barWidth = 15;
    const spacingWidth = 8;
    const totalWidth = (barWidth * totalBars) + (spacingWidth * (totalBars - 1));
    
    halfHourlyPrices.forEach((halfHourData, index) => {
        let barColumn = chartStack.addStack();
        barColumn.layoutVertically();
        barColumn.size = new Size(barWidth, 100); // Fix the column width
        
        // Calculate bar height
        const price = parseFloat(halfHourData.price) || 0;
        const maxBarHeight = 80;
        const barHeight = Math.max((price / maxPrice) * maxBarHeight, 8);
        
        // Add spacer at top to push bar down
        barColumn.addSpacer(maxBarHeight - barHeight);
        
        // Create bar stack
        let barStack = barColumn.addStack();
        barStack.layoutVertically();
        barStack.size = new Size(barWidth, barHeight);
        barStack.backgroundColor = halfHourData.hour === tariffData.now.time
            ? CONFIG.style.priceDecreaseColor 
            : CONFIG.style.electricityColor;
            
        // Add small spacing before label
        barColumn.addSpacer(4);
        
        // Add hour label at the bottom
        let hourLabel = barColumn.addText(halfHourData.hour);
        hourLabel.font = Font.systemFont(8);
        hourLabel.textColor = CONFIG.style.textColor;
        hourLabel.minimumScaleFactor = 0.5; // Allow text to scale down if needed
        
        // Add spacing between bars (except for the last bar)
        if (index < totalBars - 1) {
            chartStack.addSpacer(spacingWidth);
        }
    });
}

// Main
async function main() {
    // Determine widget size from config or default to small
    const isSmallWidget = !config.runsInWidget || config.widgetFamily === "small";
    
    // Create appropriate widget based on size
    const widget = isSmallWidget ? 
        await createWidget() : 
        await CreateMediumWidget();
    
    if (isSmallWidget) {
        // Small widget: vertical layout
        await displayTariffData(widget, "bolt.fill");
        await displayConsumptionData(widget);
    } else {
        // Medium widget: side-by-side layout
        let mainStack = widget.addStack();
        mainStack.layoutHorizontally();
        mainStack.centerAlignContent();
        mainStack.addSpacer();
        
        // Left column for data
        let leftColumn = mainStack.addStack();
        leftColumn.layoutVertically();
        await displayTariffData(leftColumn, "bolt.fill");
        await displayConsumptionData(leftColumn);
        
        mainStack.addSpacer(20); // Add space between columns
        
        // Right column for graph
        let rightColumn = mainStack.addStack();
        rightColumn.layoutVertically();
        await displayGraph(rightColumn);

        mainStack.addSpacer();
    }
    
    // Present or set widget
    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else {
        isSmallWidget ? widget.presentSmall() : widget.presentMedium();
    }
    
    Script.complete();
}

await main();
