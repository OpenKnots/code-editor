const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function captureScreenshots() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  const screenshotDir = path.join(__dirname, 'public', 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  console.log('Opening http://localhost:3080...');
  await page.goto('http://localhost:3080', { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Wait a bit for the app to fully load
  await page.waitForTimeout(2000);
  
  // Screenshot 1: Main workspace
  console.log('Capturing main workspace...');
  const screenshot1 = path.join(screenshotDir, 'main-workspace.png');
  await page.screenshot({ path: screenshot1, fullPage: false });
  console.log(`Saved: ${screenshot1}`);
  
  // Try to open agent panel (look for button/element)
  try {
    await page.waitForTimeout(1000);
    
    // Screenshot 2: Try to capture with agent panel visible
    // Look for common selectors that might open the agent panel
    const agentButton = await page.$('[data-panel="agent"]') || 
                        await page.$('button:has-text("Agent")') ||
                        await page.$('[aria-label*="agent" i]');
    
    if (agentButton) {
      await agentButton.click();
      await page.waitForTimeout(1000);
      console.log('Capturing agent panel...');
      const screenshot2 = path.join(screenshotDir, 'agent-panel.png');
      await page.screenshot({ path: screenshot2, fullPage: false });
      console.log(`Saved: ${screenshot2}`);
    }
  } catch (e) {
    console.log('Could not open agent panel, taking another workspace shot...');
    const screenshot2 = path.join(screenshotDir, 'workspace-view.png');
    await page.screenshot({ path: screenshot2, fullPage: false });
    console.log(`Saved: ${screenshot2}`);
  }
  
  // Try to open terminal or settings
  try {
    await page.waitForTimeout(1000);
    
    const terminalButton = await page.$('[data-panel="terminal"]') ||
                           await page.$('button:has-text("Terminal")') ||
                           await page.$('[aria-label*="terminal" i]');
    
    if (terminalButton) {
      await terminalButton.click();
      await page.waitForTimeout(1000);
      console.log('Capturing terminal panel...');
      const screenshot3 = path.join(screenshotDir, 'terminal-panel.png');
      await page.screenshot({ path: screenshot3, fullPage: false });
      console.log(`Saved: ${screenshot3}`);
    } else {
      // Just take another screenshot of current state
      const screenshot3 = path.join(screenshotDir, 'editor-view.png');
      await page.screenshot({ path: screenshot3, fullPage: false });
      console.log(`Saved: ${screenshot3}`);
    }
  } catch (e) {
    console.log('Taking final screenshot...');
    const screenshot3 = path.join(screenshotDir, 'app-overview.png');
    await page.screenshot({ path: screenshot3, fullPage: false });
    console.log(`Saved: ${screenshot3}`);
  }
  
  await browser.close();
  console.log('\nScreenshot capture complete!');
}

captureScreenshots().catch(console.error);
