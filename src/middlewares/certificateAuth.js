

import {stringify} from "csv-stringify";
import * as fs from "fs"

export  function certificateAuth(req, res, next){
    if(!req.socket.authorized){
        
        const dateTime=(new Date()).toDateString();
        const type="Unauthorized access";
        const message="Invalid certificate";
        const datos={
            "datetime":dateTime,
            "type":type,
            "message":message
        }

        /*const csv=stringify([datos],
                        {
                            header:false,
                            columns: ['datetime', 'type', 'message']
                            
                        });*/
        const csv="\n"+Object.values(datos).join(',');
        
        fs.appendFileSync("./log/log.csv",csv);
        

        


        return res.status(401).send('Invalid client certificate authentication.');
    }return next();


}