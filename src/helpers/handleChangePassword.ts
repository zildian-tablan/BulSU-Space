import { functionsInstance } from "../firebase/config";
import { httpsCallable, getFunctions } from "firebase/functions";

type handleChangePassword = {
   newPassword: string,
   confirmPassword: string
}

type VerifyResponse = {
  success: boolean;
  msg?: string;
};

/**
 * @description request reset password from the firebase function
 * 
 * @var result
 * @returns {object: success | token_expired | fail}
 */
async function handleChangePassword({newPassword, confirmPassword} : handleChangePassword) {

   try {

      const verifyResetPasswordToken = httpsCallable<
         { url: string; newPassword: string; confirmPassword: string },
         VerifyResponse
         >(functionsInstance, "verifyResetPasswordToken");

      // Example URL (from your password reset link)
      const url = window.location.href;

      const result = await verifyResetPasswordToken({ url, newPassword, confirmPassword });

      if (result.data.success) {
         return 'success'
      } else if (!result.data.success && result.data.msg === 'Token expired') {
         return 'token_expired'
      } else {
         alert(result.data.msg)
         console.log('Error: ', result.data)
         return 'fail'
      }

      console.log("Result Data: ", result.data)

   } catch (error) {

   }
}

export default handleChangePassword