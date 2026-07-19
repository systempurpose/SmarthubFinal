import dotenv from 'dotenv';
dotenv.config();
import { askGroq } from './js/groqService.js';

async function test() {
  const response = await askGroq('Why is fast inference important for diagnostics?');
  console.log(response);
}
test();