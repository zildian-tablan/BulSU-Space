// Sample users for testing
export const initialUsers = [
  {
    id: 1,
    email: 'student@bulsu.edu.ph',
    name: 'John Student',
    idNumber: '2023-12345',
    role: 'student',
    password: 'password123',
    profile_pic: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop'
  },
  {
    id: 2,
    email: 'faculty@bulsu.edu.ph',
    name: 'Sarah Faculty',
    idNumber: 'F-12345',
    role: 'faculty',
    password: 'password123',
    profile_pic: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop'
  },
  {
    id: 3,
    email: 'alumni@bulsu.edu.ph',
    name: 'Mark Alumni',
    idNumber: 'A-12345',
    role: 'alumni',
    password: 'password123',
    profile_pic: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&h=150&fit=crop'
  }
];

// Initialize users in localStorage if not already present - DISABLED
export const initializeUsers = () => {
  console.log('User initialization is disabled - no sample users will be created');
  // const existingUsers = localStorage.getItem('users');
  // if (!existingUsers) {
  //   localStorage.setItem('users', JSON.stringify({ users: initialUsers }));
  // }
};
