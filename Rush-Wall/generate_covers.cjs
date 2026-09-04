const Jimp = require('jimp');

async function generateCovers() {
  const logoPath = './public/logo.png';
  console.log('Loading logo...');
  const logo = await Jimp.read(logoPath);
  
  // Use the logo's background color (top-left pixel) for seamless blending
  const backgroundColor = logo.getPixelColor(0, 0);

  const configs = [
    { name: 'cover_landscape_1920x1080.png', width: 1920, height: 1080, padding: 0.2 },
    { name: 'cover_portrait_800x1200.png', width: 800, height: 1200, padding: 0.15 },
    { name: 'cover_square_800x800.png', width: 800, height: 800, padding: 0.2 }
  ];

  for (const config of configs) {
    console.log(`Generating ${config.name}...`);
    // Create base image
    const bg = new Jimp(config.width, config.height, backgroundColor);
    
    // Scale logo to fit
    const logoClone = logo.clone();
    
    // Available width/height considering padding
    const targetWidth = config.width * (1 - config.padding * 2);
    const targetHeight = config.height * (1 - config.padding * 2);
    
    logoClone.scaleToFit(targetWidth, targetHeight);
    
    // Center logo
    const x = (config.width - logoClone.bitmap.width) / 2;
    const y = (config.height - logoClone.bitmap.height) / 2;
    
    bg.composite(logoClone, x, y);
    
    await bg.writeAsync(`./public/${config.name}`);
    console.log(`Saved ${config.name}`);
  }
}

generateCovers().catch(console.error);
