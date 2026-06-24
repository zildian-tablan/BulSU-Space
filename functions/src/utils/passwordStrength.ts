function passwordStrength(password: string) {

   let score = 0;
   let feedback = '';

   if (password.length >= 8) score += 1;
   if (/[A-Z]/.test(password)) score += 1;
   if (/[a-z]/.test(password)) score += 1;
   if (/[0-9]/.test(password)) score += 1;
   if (/[^A-Za-z0-9]/.test(password)) score += 1;

   switch (score) {
   case 0:
   case 1:
      feedback = 'Very Weak';
      break;
   case 2:
      feedback = 'Weak';
      break;
   case 3:
      feedback = 'Fair';
      break;
   case 4:
      feedback = 'Strong';
      break;
   case 5:
      feedback = 'Very Strong';
      break;
   default:
      feedback = '';
   }

   if (score === 3 || score === 4 || score === 5) {
      return 'pass'
   } else {
      return 'fail'
   }

}

export default passwordStrength