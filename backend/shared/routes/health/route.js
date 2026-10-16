import { route } from '../../../lib/http.js';
export const GET=route({auth:'none'},()=>({ok:true,mode:'shared',service:'growthos-ai'}));
