import React from 'react';

const MaintenancePage: React.FC = () => {
  const handleRefresh = () => window.location.reload();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-2xl text-center space-y-6">
        <img src="/images/bulsu-space-logo.png" alt="BulSU Space" className="mx-auto w-16 h-16" />
        <h1 className="text-3xl sm:text-4xl font-extrabold">We'll be right back</h1>
        <p className="text-lg sm:text-xl text-gray-200">
          The system is temporarily offline for maintenance and is currently shutdown.
        </p>

        <div className="mx-auto max-w-xl text-sm text-gray-300">
          <p>
            Our team is applying updates to improve stability and performance. Most services should return within  few days.
          </p>
          <p className="mt-3">Please check again later or refresh the page to see if the site is available.</p>
        </div>

        <div className="flex items-center justify-center space-x-3">
          <button
            onClick={handleRefresh}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-full font-medium shadow-lg"
          >
            Refresh
          </button>
          <a
            className="text-sm text-gray-300 underline hover:text-white"
            href="#"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            View status updates
          </a>
        </div>

        <div className="flex items-center justify-center mt-2">
          <svg className="animate-spin h-6 w-6 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
        </div>

        <p className="text-xs text-gray-500">If you need immediate assistance, contact your administrator.</p>
      </div>
    </div>
  );
};

export default MaintenancePage;
