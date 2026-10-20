

export function certificateAuth(req, res, next){
    if(!req.socket.authorized){
        return res.status(401).send('Invalid client certificate authentication.');
    }return next();


}