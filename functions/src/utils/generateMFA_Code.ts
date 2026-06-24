function generateMFA_Code() {

   let codes = ''

   for (let i = 0; i < 6; i++) {
      
      const code = Math.floor(Math.random() * 10)
      codes += code
   }

   

   return codes
   
}

export default generateMFA_Code