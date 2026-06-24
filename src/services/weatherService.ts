import { Weather } from '../types';

/**
 * Weather service for getting current weather information
 * Uses WeatherAPI.com for real weather data
 */

// WeatherAPI.com configuration
const WEATHER_API_KEY = '43745a1621434fcf972161451252405';
const WEATHER_API_BASE_URL = 'https://api.weatherapi.com/v1';

// Default location: Hagonoy, Bulacan
const DEFAULT_LOCATION = {
  name: 'Hagonoy, Bulacan',
  query: 'Hagonoy,Bulacan,Philippines'
};

// Location permission status
type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

// Mock weather data fallback
const mockWeatherData: Weather = {
  location: 'Hagonoy, Bulacan',
  temperature: 28,
  condition: 'Partly Cloudy',
  icon: 'partly_cloudy_day',
  humidity: 72,
  windSpeed: 8
};

// Weather conditions mapping for WeatherAPI to Material Icons
const weatherConditions = {
  'Sunny': 'wb_sunny',
  'Clear': 'wb_sunny',
  'Partly cloudy': 'partly_cloudy_day',
  'Partly Cloudy': 'partly_cloudy_day',
  'Cloudy': 'cloud',
  'Overcast': 'cloud',
  'Mist': 'foggy',
  'Patchy rain possible': 'rainy',
  'Patchy snow possible': 'ac_unit',
  'Patchy sleet possible': 'grain',
  'Patchy freezing drizzle possible': 'grain',
  'Thundery outbreaks possible': 'thunderstorm',
  'Blowing snow': 'ac_unit',
  'Blizzard': 'ac_unit',
  'Fog': 'foggy',
  'Freezing fog': 'foggy',
  'Patchy light drizzle': 'grain',
  'Light drizzle': 'grain',
  'Freezing drizzle': 'grain',
  'Heavy freezing drizzle': 'grain',
  'Patchy light rain': 'rainy',
  'Light rain': 'rainy',
  'Moderate rain at times': 'rainy',
  'Moderate rain': 'rainy',
  'Heavy rain at times': 'rainy',
  'Heavy rain': 'rainy',
  'Light freezing rain': 'rainy',
  'Moderate or heavy freezing rain': 'rainy',
  'Light sleet': 'grain',
  'Moderate or heavy sleet': 'grain',
  'Patchy light snow': 'ac_unit',
  'Light snow': 'ac_unit',
  'Patchy moderate snow': 'ac_unit',
  'Moderate snow': 'ac_unit',
  'Patchy heavy snow': 'ac_unit',
  'Heavy snow': 'ac_unit',
  'Ice pellets': 'ac_unit',
  'Light rain shower': 'rainy',
  'Moderate or heavy rain shower': 'rainy',
  'Torrential rain shower': 'rainy',
  'Light sleet showers': 'grain',
  'Moderate or heavy sleet showers': 'grain',
  'Light snow showers': 'ac_unit',
  'Moderate or heavy snow showers': 'ac_unit',
  'Light showers of ice pellets': 'ac_unit',
  'Moderate or heavy showers of ice pellets': 'ac_unit',
  'Patchy light rain with thunder': 'thunderstorm',
  'Moderate or heavy rain with thunder': 'thunderstorm',
  'Patchy light snow with thunder': 'thunderstorm',
  'Moderate or heavy snow with thunder': 'thunderstorm'
};

/**
 * Check if geolocation is supported and get permission status
 */
export const checkLocationPermission = (): Promise<LocationPermission> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve('unsupported');
      return;
    }

    // Check if we already have permission
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        resolve(result.state as LocationPermission);
      }).catch(() => {
        resolve('prompt');
      });
    } else {
      resolve('prompt');
    }
  });
};

/**
 * Request location permission and get coordinates
 */
export const getUserLocation = (): Promise<{ lat: number; lon: number; name: string }> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Get location name using reverse geocoding
        try {
          const locationName = await reverseGeocode(latitude, longitude);
          resolve({
            lat: latitude,
            lon: longitude,
            name: locationName
          });
        } catch (error) {
          // Use coordinates if reverse geocoding fails
          resolve({
            lat: latitude,
            lon: longitude,
            name: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
          });
        }
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  });
};

/**
 * Reverse geocode coordinates to get location name using WeatherAPI
 */
const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
  try {
    const response = await fetch(
      `${WEATHER_API_BASE_URL}/current.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&aqi=no`
    );
    const data = await response.json();
    
    if (data.location?.name && data.location?.region) {
      return `${data.location.name}, ${data.location.region}`;
    }
    
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
};

/**
 * Fetch weather data from WeatherAPI
 */
const fetchWeatherData = async (query: string): Promise<Weather> => {
  const response = await fetch(
    `${WEATHER_API_BASE_URL}/current.json?key=${WEATHER_API_KEY}&q=${query}&aqi=no`
  );

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();
  
  const condition = data.current?.condition?.text || 'Clear';
  const locationName = data.location?.name && data.location?.region 
    ? `${data.location.name}, ${data.location.region}`
    : 'Unknown Location';
  
  return {
    location: locationName,
    temperature: Math.round(data.current.temp_c),
    condition: condition,
    icon: getWeatherIcon(condition),
    humidity: data.current.humidity,
    windSpeed: Math.round(data.current.wind_kph)
  };
};

/**
 * Get weather icon based on condition
 * @param condition Weather condition string
 * @returns Material Icon name
 */
export const getWeatherIcon = (condition: string): string => {
  return weatherConditions[condition as keyof typeof weatherConditions] || 'wb_sunny';
};

/**
 * Format temperature for display
 * @param temp Temperature in Celsius
 * @returns Formatted temperature string
 */
export const formatTemperature = (temp: number): string => {
  return `${Math.round(temp)}°C`;
};

/**
 * Get weather description based on temperature and condition
 * @param weather Weather object
 * @returns Descriptive text about the weather
 */
export const getWeatherDescription = (weather: Weather): string => {
  const { temperature, condition } = weather;
  
  if (temperature >= 35) {
    return 'Very hot - stay hydrated!';
  } else if (temperature >= 30) {
    return 'Warm weather today';
  } else if (temperature >= 25) {
    return 'Pleasant temperature';
  } else if (temperature >= 20) {
    return 'Cool and comfortable';
  } else {
    return 'Cool weather';
  }
};

/**
 * Get current weather for user's location or default location
 * @param useUserLocation Whether to try to use user's location
 * @returns Promise<Weather> Current weather data
 */
export const getCurrentWeather = async (useUserLocation: boolean = false): Promise<Weather> => {
  try {
    let query = DEFAULT_LOCATION.query;
    let locationName = DEFAULT_LOCATION.name;
    
    // Try to get user's location if requested
    if (useUserLocation) {
      try {
        const userLocation = await getUserLocation();
        query = `${userLocation.lat},${userLocation.lon}`;
        locationName = userLocation.name;
      } catch (error) {
        console.warn('Could not get user location, using default:', error);
        // Fall back to default location
      }
    }
    
    // Fetch real weather data
    try {
      return await fetchWeatherData(query);
    } catch (error) {
      console.warn('Weather API failed, using mock data:', error);
      // Return mock data with location name
      return {
        ...mockWeatherData,
        location: locationName
      };
    }
    
  } catch (error) {
    console.error('Error getting weather data:', error);
    return mockWeatherData;
  }
};

/**
 * Get weather data for a specific location query
 * @param query Location query (city name, coordinates, etc.)
 * @returns Promise<Weather> Weather data for the location
 */
export const getWeatherForLocation = async (query: string): Promise<Weather> => {
  try {
    return await fetchWeatherData(query);
  } catch (error) {
    console.error('Error fetching weather for location:', error);
    throw error;
  }
};
