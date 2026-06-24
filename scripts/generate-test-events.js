// Script to generate 50 test events for BulSU Space
// Usage: node generate-test-events.js

const admin = require('firebase-admin');
const { Timestamp } = require('firebase/firestore');

// Firebase project configuration
const firebaseConfig = {
  projectId: "bulsuspace"
};

// Path to service account file - you need to create this file with proper credentials
// See https://firebase.google.com/docs/admin/setup for more information
const serviceAccountPath = './server/serviceAccountKey.json';

// Categories from your EventCategory enum
const EVENT_CATEGORIES = [
  'Academic',
  'Social',
  'Cultural',
  'Sports',
  'Webinar',
  'Workshop',
  'Conference',
  'Competition',
  'Other'
];

// Sample locations
const LOCATIONS = [
  'Main Auditorium',
  'College of Engineering',
  'College of Arts',
  'Sports Complex',
  'Virtual Meeting',
  'Online Platform',
  'Gymnasium',
  'Library',
  'Computer Laboratory',
  'Audiovisual Room'
];

// Sample cover images (placeholder images)
const COVER_IMAGES = [
  'https://placehold.co/800x400/3b82f6/FFFFFF?text=Academic+Event',
  'https://placehold.co/800x400/ef4444/FFFFFF?text=Social+Event',
  'https://placehold.co/800x400/10b981/FFFFFF?text=Cultural+Event',
  'https://placehold.co/800x400/8b5cf6/FFFFFF?text=Sports+Event',
  'https://placehold.co/800x400/f59e0b/FFFFFF?text=Webinar',
  'https://placehold.co/800x400/ec4899/FFFFFF?text=Workshop',
  'https://placehold.co/800x400/6366f1/FFFFFF?text=Conference'
];

// Sample registration links
const REGISTRATION_LINKS = [
  'https://forms.google.com/register',
  'https://bulsu-edu.ph/register',
  'https://zoom.us/meeting/register',
  'https://eventbrite.com',
  ''  // Some events don't have registration links
];

// Admin user data - replace with your actual admin user ID
const ADMIN_USER = {
  id: 'admin123',  // Replace with an actual admin ID from your system
  name: 'Test Admin',
  role: 'admin'
};

// Generate a random date within a range
function getRandomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Generate a random integer between min and max (inclusive)
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get a random item from an array
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Generate Lorem Ipsum text for descriptions
function generateLoremIpsum(numSentences) {
  const sentences = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    "Vestibulum ac diam sit amet quam vehicula elementum sed sit amet dui.",
    "Pellentesque in ipsum id orci porta dapibus.",
    "Nulla quis lorem ut libero malesuada feugiat.",
    "Curabitur non nulla sit amet nisl tempus convallis quis ac lectus.",
    "Donec rutrum congue leo eget malesuada.",
    "Curabitur aliquet quam id dui posuere blandit.",
    "Mauris blandit aliquet elit, eget tincidunt nibh pulvinar a.",
    "Donec sollicitudin molestie malesuada.",
    "Praesent sapien massa, convallis a pellentesque nec, egestas non nisi."
  ];
  
  let result = [];
  for (let i = 0; i < numSentences; i++) {
    result.push(sentences[i % sentences.length]);
  }
  return result.join(' ');
}

// Generate an event object
function generateEvent(index, futureEvent = true) {
  // Determine time range
  const now = new Date();
  let startDate, endDate;
  
  if (futureEvent) {
    // Future events: from tomorrow up to 3 months in the future
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const threeMonthsLater = new Date(now);
    threeMonthsLater.setMonth(now.getMonth() + 3);
    
    startDate = getRandomDate(tomorrow, threeMonthsLater);
  } else {
    // Past events: from 3 months ago up to yesterday
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    startDate = getRandomDate(threeMonthsAgo, yesterday);
  }
  
  // Event duration: 1-4 hours
  endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + getRandomInt(1, 4));
  
  // Event category
  const category = getRandomItem(EVENT_CATEGORIES);
  
  // Generate title based on category and index
  const titlePrefixes = ["Annual", "BulSU", "Student", "Faculty", "Department", "College", "Campus", "Community"];
  const titleSuffixes = ["Conference", "Workshop", "Meeting", "Gathering", "Seminar", "Training", "Exhibition", "Competition"];
  
  const title = `${getRandomItem(titlePrefixes)} ${category} ${getRandomItem(titleSuffixes)} #${index + 1}`;
  
  // Generate event object
  return {
    title: title,
    description: generateLoremIpsum(getRandomInt(3, 6)),
    location: getRandomItem(LOCATIONS),
    category: category,
    start: Timestamp.fromDate(startDate),
    end: Timestamp.fromDate(endDate),
    coverImage: getRandomItem(COVER_IMAGES),
    createdBy: ADMIN_USER.id,
    creatorName: ADMIN_USER.name,
    creatorRole: ADMIN_USER.role,
    registrationLink: Math.random() > 0.3 ? getRandomItem(REGISTRATION_LINKS) : "" // 70% chance to have registration link
  };
}

// Main function to generate and save events
async function generateTestEvents() {
  try {
    // Initialize Firebase Admin
    try {
      // Try to initialize with service account
      admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
        databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
      });
      console.log('Initialized with service account');
    } catch (error) {
      console.error('Error initializing with service account, falling back to default:', error.message);
      // Fall back to default credentials
      admin.initializeApp({
        projectId: firebaseConfig.projectId
      });
    }
    
    const db = admin.firestore();
    const eventsCollection = db.collection('events');
    
    console.log('Starting to generate 50 test events...');
    
    // Generate and save 25 upcoming events and 25 past events
    const eventPromises = [];
    
    // Generate 25 upcoming events
    for (let i = 0; i < 25; i++) {
      const event = generateEvent(i, true);
      eventPromises.push(eventsCollection.add({
        ...event,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        registrationCount: 0
      }));
    }
    
    // Generate 25 past events
    for (let i = 25; i < 50; i++) {
      const event = generateEvent(i, false);
      eventPromises.push(eventsCollection.add({
        ...event,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        registrationCount: 0
      }));
    }
    
    // Wait for all events to be added
    await Promise.all(eventPromises);
    
    console.log('Successfully generated 50 test events!');
    console.log(' - 25 upcoming events');
    console.log(' - 25 past events');
  } catch (error) {
    console.error('Error generating test events:', error);
  }
}

// Execute the main function
generateTestEvents()
  .then(() => {
    console.log('Script execution completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
