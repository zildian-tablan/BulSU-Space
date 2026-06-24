import { SidebarSection } from '../types';

export const sidebarSections: SidebarSection[] = [
  {
    title: 'Academic Calendar',
    icon: 'calendar_today',
    content: [
      {
        title: 'First Semester',
        date: '2025-06-01',
        events: [
          { title: 'Start of Classes', date: '2025-06-01' },
          { title: 'Preliminary Examinations', date: '2025-07-15' },
          { title: 'Midterm Examinations', date: '2025-08-30' },
          { title: 'Final Examinations', date: '2025-10-15' }
        ]
      },
      {
        title: 'Second Semester',
        date: '2025-11-01',
        events: [
          { title: 'Start of Classes', date: '2025-11-01' },
          { title: 'Preliminary Examinations', date: '2025-12-15' },
          { title: 'Midterm Examinations', date: '2026-01-30' },
          { title: 'Final Examinations', date: '2026-03-15' }
        ]
      }
    ]
  },
  {
    title: 'Upcoming Events',
    icon: 'event',
    content: [
      {
        title: 'Tech Innovation Summit',
        date: '2025-04-20',
        image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop',
        description: 'Join us for the latest in tech innovation'
      },
      {
        title: 'Research Conference',
        date: '2025-05-01',
        image: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=400&h=300&fit=crop',
        description: 'Annual research presentation day'
      },
      {
        title: 'Campus Job Fair',
        date: '2025-05-15',
        image: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=400&h=300&fit=crop',
        description: 'Meet top employers on campus'
      }
    ]
  },
  {
    title: 'Recommended Spaces',
    icon: 'group',
    content: [
      {
        name: 'Computer Science Society',
        members: 1250,
        image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=200&h=200&fit=crop'
      },
      {
        name: 'BulSU Research Hub',
        members: 850,
        image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=200&h=200&fit=crop'
      },
      {
        name: 'Engineering Club',
        members: 2100,
        image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=200&h=200&fit=crop'
      },
      {
        name: 'Entrepreneurship Circle',
        members: 560,
        image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=200&h=200&fit=crop'
      },
      {
        name: 'Arts & Culture Guild',
        members: 1340,
        image: 'https://images.unsplash.com/photo-1497032205916-ac775f0649ae?w=200&h=200&fit=crop'
      }
    ]
  },
  {
    title: 'Users You May Know',
    icon: 'person_search',
    content: []
  }
];
