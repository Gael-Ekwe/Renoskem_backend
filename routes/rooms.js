const express = require('express');
const router = express.Router();

require('../models/connection');
const Room = require('../models/room');
const Teammate = require('../models/teammate');
const Artisan = require('../models/artisan');
const Project = require('../models/project');
const uid2 = require('uid2');


//------------Création de room-----------//
router.post('/newRoom', async (req, res) => {
    try {
        const newRoom = new Room({

            type: req.body.type,
           // name: req.body.name,
            //items: req.body.items,
            //surface: req.body.surface,
            //comment: req.body.comment,
            //project: req.body.project

        });

        await newRoom.save();

        res.status(201).json({ message: 'Room successfully added', room: newRoom });
    } catch (error) {
        res.status(500).json({ message: 'Error saving room', error });
    }
});

//------------Récupère une room avec son id----------------//

router.get("/getRoom/:id", async (req, res) => {
    try {
        const room = await Room.findOne({ _id: req.params.id });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        res.status(200).json({ message: 'Room found', room: room });
    } catch (error) {
        res.status(500).json({ message: 'Error during search', error });
    }
});

//------------Récupère les rooms d'un projet-----------//
router.get('/getRoomsByProject/:projectId', async (req, res) => {
    try {
        const projectId = req.params.projectId;
        // console.log(`Fetching rooms for project: ${projectId}`);
        const rooms = await Room.find({ project: projectId });

        if (!rooms) {
            return res.status(404).json({ message: 'Rooms not found' });
        }

        res.status(200).json({ rooms });
    } catch (error) {
        // console.error('Error fetching rooms:', error);
        res.status(500).json({ message: 'Error during search', error });
    }
});



//-----------Met à jour les pièces d'un projet--------------//
router.post('/updateRooms', async (req, res) => {

    const { projectId, rooms } = req.body; // Récupérer l'ID du projet et les nouvelles pièces du corps de la requête
    // console.log('Updating rooms for project:', projectId, rooms);

    try {
        // Trouver le projet par ID et peupler les pièces associées
        const project = await Project.findById(projectId).populate('rooms');
        if (!project) {
            return res.status(404).json({ message: 'Project not found' }); // Retourner une erreur si le projet n'est pas trouvé
        }

        const existingRooms = project.rooms; // Obtenir les pièces existantes du projet
        // console.log('Existing rooms:', existingRooms.length);

        const roomCounts = Object.entries(rooms); // Convertir les pièces en un tableau d'entrées [type, count]

        let totalRooms = 0;
        for (const [type, newCount] of roomCounts) {
            totalRooms += newCount; // Calculer le nombre total de pièces
            if (type === 'Grenier/Combles' && newCount > 1) {
                return res.status(400).json({ message: 'Only one Grenier/Combles is allowed' }); // Vérifier qu'il n'y a pas plus d'un Grenier/Combles
            }
        }

        if (totalRooms > 18) {
            return res.status(400).json({ message: 'A maximum of 18 rooms is allowed' }); // Vérifier que le nombre total de pièces ne dépasse pas 18
        }

        // Boucle sur chaque type de pièce dans les comptes
        for (const [type, newCount] of roomCounts) {
            const currentRoomsOfType = existingRooms.filter(room => room.type === type); // Trouver les pièces actuelles de ce type
            const currentCount = currentRoomsOfType.length; // Compter les pièces actuelles de ce type

            // console.log(`Type: ${type}, Current count: ${currentCount}, New count: ${newCount}`);

            // Si le nouveau compte est supérieur, ajouter des pièces
            if (newCount > currentCount) {
                for (let i = 0; i < newCount - currentCount; i++) {
                    const newRoom = new Room({ type, project: projectId }); // Créer une nouvelle pièce
                    await newRoom.save(); // Sauvegarder la nouvelle pièce dans la base de données
                    project.rooms.push(newRoom); // Ajouter la nouvelle pièce à la liste des pièces du projet
                }
            }
            // Si le nouveau compte est inférieur, supprimer des pièces
            else if (newCount < currentCount) {
                for (let i = 0; i < currentCount - newCount; i++) {
                    const roomToRemove = currentRoomsOfType[i];
                    // console.log('Removing room:', roomToRemove.type);

                    // Supprimer la pièce de la base de données
                    await Room.findByIdAndDelete(roomToRemove._id);

                    // Supprimer la pièce de la liste des pièces du projet
                    project.rooms = project.rooms.filter(room => !room._id.equals(roomToRemove._id));
                }
            }
        }

        // Sauvegarder le projet mis à jour
        await project.save();

        // Retourner les pièces mises à jour
        const updatedRooms = await Room.find({ project: projectId });
        res.status(200).json({ message: 'Rooms updated successfully', rooms: updatedRooms });
    } catch (error) {
        // console.error('Error updating rooms:', error);
        res.status(500).json({ message: 'Error updating rooms', error }); // Gérer les erreurs et renvoyer une réponse appropriée
    }
});

//---------------Update détails d'une room (ajoute/supprime/modifie)-----------//

router.put("/editRoom", async (req, res) => {
    try {
        // Récupération des données de la requête
        const { roomId, name, surface, comment, itemsToAdd, itemsToRemove, itemsToModify } = req.body;

        console.log('Received request:', req.body); // Log pour déboguer les données reçues

        // Vérification de l'existence de la pièce
        let room = await Room.findById(roomId);

        // Si la pièce n'existe pas, renvoyer une réponse 404
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }

        // Mise à jour des champs de base de la pièce
        if (name) room.name = name; // Met à jour le nom si fourni
        if (surface) room.surface = surface; // Met à jour la surface si fournie
        if (comment) room.comment = comment; // Met à jour le commentaire si fourni

        console.log('Room before updates:', room); // Log pour déboguer l'état de la pièce avant les mises à jour

        // Ajout des nouveaux items
        if (itemsToAdd && itemsToAdd.length > 0) {
            console.log("Ajout de nouveau Item")
            itemsToAdd.forEach(item => {
                // Vérifie si l'item existe déjà dans la pièce
                const exists = room.items.some(existingItem => existingItem.field === item.field);
                if (!exists) {
                    // Si l'item n'existe pas, il est ajouté à la liste des items
                    const newItem = {
                        id: uid2(24), // Génère un identifiant unique
                        field: item.field,
                        difficulty: item.difficulty,
                        diy: true, // Par défaut, l'item est fait maison (DIY)
                        artisan: null, // Pas d'artisan associé par défaut
                        teammates: [] // Pas de coéquipiers associés par défaut
                    };
                    room.items.push(newItem);
                } else {
                    console.log(`Item with field ${item.field} already exists`); // Log pour déboguer les items déjà existants
                }
            });
        }

        // Suppression des items
        if (itemsToRemove && itemsToRemove.length > 0) {
            console.log("Suppression d'item")
            itemsToRemove.forEach(itemField => {
                // Trouve l'index de l'item à supprimer
                const itemIndex = room.items.findIndex(item => item.field === itemField);
                if (itemIndex !== -1) {
                    // Supprime l'item de la liste
                    room.items.splice(itemIndex, 1);
                }
            });
        }

        // Modification des items existants
        if (itemsToModify && itemsToModify.length > 0) {
            console.log("Modification d'items existants")
            console.log('Items to modify:', itemsToModify); // Log pour déboguer les items à modifier
            itemsToModify.forEach(modifiedItem => {
                // Trouve l'index de l'item à modifier
                const itemIndex = room.items.findIndex(item => item.field === modifiedItem.field);
                if (itemIndex !== -1) {
                    // Met à jour la difficulté de l'item
                    room.items[itemIndex].difficulty = modifiedItem.difficulty;
                } else {
                    console.log(`Item with field ${modifiedItem.field} not found`); // Log pour déboguer les items non trouvés
                }
            });
        }

        console.log('Room after updates:', room); // Log pour déboguer l'état de la pièce après les mises à jour

        // Sauvegarder la pièce avec les modifications
        await room.save();

        // Renvoie une réponse de succès avec la pièce mise à jour
        res.status(200).json({ message: 'Room updated successfully', room });
    } catch (error) {
        console.error('Error during update:', error); // Log détaillé de l'erreur
        // Renvoie une réponse d'erreur en cas de problème
        res.status(500).json({ message: 'Error during update', error });
    }
});






/*
router.put("/editRoom/:id/:name/:surface/:comment", async (req, res) => {
    try {
        const room = await Room.findByIdAndUpdate({ _id: req.params.id }, {
            name: req.params.name,
            surface: req.params.surface,
            comment: req.params.comment
        }, { new: true });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        res.status(200).json({ message: 'Room updated successfully', room: room });
    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});*/


router.put("/changeRoomName/:id/:name", async (req, res) => {
    try {
        const room = await Room.findByIdAndUpdate({ _id: req.params.id }, {
            name: req.params.name,
        }, { new: true });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        res.status(200).json({ message: 'Room name changed successfully', room: room });
    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});


router.put("/setRoomSurface/:id/:surface", async (req, res) => {
    try {
        const room = await Room.findByIdAndUpdate({ _id: req.params.id }, {
            surface: req.params.surface,
        }, { new: true });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        res.status(200).json({ message: 'Room surface updated successfully', room: room });
    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});


router.put("/addCommentToRoom/:id/:comment", async (req, res) => {
    try {

        console.log('totooo',req.params.comment);
        const room = await Room.findByIdAndUpdate({ _id: req.params.id }, {
            comment: req.params.comment
        }, { new: true });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        res.status(200).json({ message: 'Comment added successfully', room: room });
    } catch (error) {
        res.status(500).json({ message: 'Error during addition', error });
    }
});


 



router.put("/removeItemFromRoom/:roomId/:itemId", async (req, res) => {
    try {

        const room = await Room.findOne({ _id: req.params.roomId });
       
        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        const index = await room.items.findIndex((item) => item.id === req.params.itemId);

        if (index < 0) {
            return res.status(401).json({ message: 'Item not found' });
        }

        const item = room.items[index];

        for(let i = 0; i < item.teammates.length; i++){
            const teammate = await Teammate.findOne({ _id: item.teammates[i] });
            const index = await teammate.items.findIndex((e) => e.id === item.id);
            teammate.items.splice(index, 1);
            await teammate.save();
        }

        await room.items.splice(index, 1);

        await room.save();

        res.status(200).json({ message: 'Item removed from room successfully', room: room });


    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});


router.put("/assignItemToTeammate/:roomId/:itemId/:teammateId", async (req, res) => {
    try {

        const room = await Room.findOne({ _id: req.params.roomId });
        const teammate = await Teammate.findOne({ _id: req.params.teammateId });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        if (!teammate) {
            return res.status(401).json({ message: 'Teammate not found' });
        }

        const index = await room.items.findIndex((item) => item.id === req.params.itemId);

        if (index < 0) {
            return res.status(401).json({ message: 'Item not found' });
        }

        const item = room.items[index];

        if (item.teammates.includes(req.params.teammateId) || teammate.items.includes(req.params.itemId)) {
            return res.status(401).json({ message: 'Item already assigned to teammate' });
        }

        await item.teammates.push(req.params.teammateId);

        await teammate.items.push(req.params.itemId);

        await room.save();

        await teammate.save();

        res.status(200).json({ message: 'Item assigned to teammate successfully', room: room });


    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});





router.put("/removeItemFromTeammate/:roomId/:itemId/:teammateId", async (req, res) => {
    try {

        const room = await Room.findOne({ _id: req.params.roomId });
        const teammate = await Teammate.findOne({ _id: req.params.teammateId });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        if (!teammate) {
            return res.status(401).json({ message: 'Teammate not found' });
        }

        const index = await room.items.findIndex((item) => item.id === req.params.itemId);

        if (index < 0) {
            return res.status(401).json({ message: 'Item not found' });
        }

        const item = room.items[index];

        if (!item.teammates.includes(req.params.teammateId) || !teammate.items.includes(req.params.itemId)) {
            return res.status(401).json({ message: 'Item is not assigned to teammate' });
        }

        const index2 = await item.teammates.findIndex((teammate) => teammate._id === req.params.teammateId);

        const index3 = await teammate.items.findIndex((item) => item.id === req.params.itemId);

        await item.teammates.splice(index2, 1);

        await teammate.items.splice(index3, 1);

        await room.save();

        await teammate.save();

        res.status(200).json({ message: 'Item removed from teammate successfully', room: room });


    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});



router.put("/assignItemToArtisan/:roomId/:itemId/:artisanId", async (req, res) => {
    try {

        const room = await Room.findOne({ _id: req.params.roomId });
        const artisan = await Artisan.findOne({ _id: req.params.artisanId });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        if (!artisan) {
            return res.status(401).json({ message: 'Artisan not found' });
        }

        const index = await room.items.findIndex((item) => item.id === req.params.itemId);

        if (index < 0) {
            return res.status(401).json({ message: 'Item not found' });
        }

        const item = room.items[index];

        console.log('item.artisan', item.artisan, 'req.params.artisanId', req.params.artisanId);

        //Tester si le poste de travail a déjà été attribué à l'artisant   /!\ le test est-il pertinant ?? /!\
        if (item.artisan === req.params.artisanId) {
            return res.status(401).json({ message: 'Item already assigned to artisan' });
        }

        item.artisan = req.params.artisanId;

        await room.save();

        res.status(200).json({ message: 'Item assigned to artisan successfully', room: room });

    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});



router.put("/setItemArtisan/:roomId/:itemId/:availability/:trustLevel/:quote/:comment", async (req, res) => {
    try {

        const room = await Room.findOne({ _id: req.params.roomId });
        const artisan = await Artisan.findOne({ _id: req.params.artisanId });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        if (!artisan) {
            return res.status(401).json({ message: 'Artisan not found' });
        }

        const index = await room.items.findIndex((item) => item.id === req.params.itemId);

        if (index < 0) {
            return res.status(401).json({ message: 'Item not found' });
        }

        const item = room.items[index];

        console.log('item.artisan', item.artisan, 'req.params.artisanId', req.params.artisanId);

        //Tester si le poste de travail a déjà été attribué à l'artisant   /!\ le test est-il pertinant ?? /!\
        if (item.artisan === req.params.artisanId) {
            return res.status(401).json({ message: 'Item already assigned to artisan' });
        }

        item.artisan.artisanId = req.params.artisanId;

        await room.save();

        res.status(200).json({ message: 'Item assigned to artisan successfully', room: room });

    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});



router.put("/removeItemFromArtisan/:roomId/:itemId/", async (req, res) => {
    try {

        const room = await Room.findOne({ _id: req.params.roomId });

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        const index = await room.items.findIndex((item) => item.id === req.params.itemId);

        if (index < 0) {
            return res.status(401).json({ message: 'Item not found' });
        }

        const item = room.items[index];

        if (!item.artisan) {
            return res.status(401).json({ message: 'Item already not assigned to any artisan' });
        }

        item.artisan = null;

        await room.save();

        res.status(200).json({ message: 'Item removed from artisan successfully', room: room });


    } catch (error) {
        res.status(500).json({ message: 'Error during update', error });
    }
});






//----route pour supprimer une room dans la collection room mais aussi dans le tableau d'objectId du projet correspondant--------//

router.delete("/deleteRoom/:id", async (req, res) => {
    try {
        // console.log('Deleting room with ID:', req.params.id); // Log pour vérifier l'ID
        const room = await Room.findByIdAndDelete(req.params.id);

        if (!room) {
            return res.status(401).json({ message: 'Room not found' });
        }

        // console.log('Room found and deleted:', room); // Log pour vérifier la suppression

        // Mettre à jour le projet pour supprimer la référence de la pièce
        await Project.findByIdAndUpdate(room.project, { $pull: { rooms: room._id } });

        res.status(200).json({ message: 'Room deleted successfully', room: room });
    } catch (error) {
        // console.error('Error during deletion:', error); // Log pour vérifier les erreurs
        res.status(500).json({ message: 'Error during deletion', error });
    }
});




module.exports = router;

