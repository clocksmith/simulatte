'use strict';
const {convert}=require('./convert-priority-study.cjs');
const source=name=>require('./priority-study-source/'+name+'.cjs');
function chat(){return convert(source('L004-chat'));}
function pagination(){return convert(source('L003-pagination'));}
function comments(){return convert(source('L009-comments'));}
function timeline(){return convert(source('L011-timeline'));}
function inventory(){return convert(source('L013-flash-sale'));}
module.exports={chat,pagination,comments,timeline,inventory};
