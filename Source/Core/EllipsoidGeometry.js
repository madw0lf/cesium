/*global define*/
define([
        './defaultValue',
        './DeveloperError',
        './Cartesian3',
        './Matrix4',
        './Ellipsoid',
        './ComponentDatatype',
        './PrimitiveType',
        './BoundingSphere',
        './GeometryAttribute',
        './GeometryIndices',
        './VertexFormat'
    ], function(
        defaultValue,
        DeveloperError,
        Cartesian3,
        Matrix4,
        Ellipsoid,
        ComponentDatatype,
        PrimitiveType,
        BoundingSphere,
        GeometryAttribute,
        GeometryIndices,
        VertexFormat) {
    "use strict";

    /**
     * DOC_TBA
     *
     * @alias EllipsoidGeometry
     * @constructor
     *
     * @exception {DeveloperError} options.numberOfPartitions must be greater than zero.
     */
    var EllipsoidGeometry = function(options) {
        options = defaultValue(options, defaultValue.EMPTY_OBJECT);

        var ellipsoid = defaultValue(options.ellipsoid, Ellipsoid.UNIT_SPHERE);
        var numberOfPartitions = defaultValue(options.numberOfPartitions, 32);

        var vertexFormat = defaultValue(options.vertexFormat, VertexFormat.DEFAULT);

        if (numberOfPartitions <= 0) {
            throw new DeveloperError('options.numberOfPartitions must be greater than zero.');
        }

        var positions = [];
        var indices = [];

        //
        // Initial cube.  In the plane, z = -1:
        //
        //                   +y
        //                    |
        //             Q2     * p3     Q1
        //                  / | \
        //              p0 *--+--* p2   +x
        //                  \ | /
        //             Q3     * p1     Q4
        //                    |
        //
        // Similarly, p4 to p7 are in the plane z = 1.
        //
        positions.push(new Cartesian3(-1, 0, -1));
        positions.push(new Cartesian3(0, -1, -1));
        positions.push(new Cartesian3(1, 0, -1));
        positions.push(new Cartesian3(0, 1, -1));
        positions.push(new Cartesian3(-1, 0, 1));
        positions.push(new Cartesian3(0, -1, 1));
        positions.push(new Cartesian3(1, 0, 1));
        positions.push(new Cartesian3(0, 1, 1));

        //
        // Edges
        //
        // 0 -> 1, 1 -> 2, 2 -> 3, 3 -> 0.  Plane z = -1
        // 4 -> 5, 5 -> 6, 6 -> 7, 7 -> 4.  Plane z = 1
        // 0 -> 4, 1 -> 5, 2 -> 6, 3 -> 7.  From plane z = -1 to plane z - 1
        //
        var edge0to1 = addEdgePositions(0, 1, numberOfPartitions, positions);
        var edge1to2 = addEdgePositions(1, 2, numberOfPartitions, positions);
        var edge2to3 = addEdgePositions(2, 3, numberOfPartitions, positions);
        var edge3to0 = addEdgePositions(3, 0, numberOfPartitions, positions);

        var edge4to5 = addEdgePositions(4, 5, numberOfPartitions, positions);
        var edge5to6 = addEdgePositions(5, 6, numberOfPartitions, positions);
        var edge6to7 = addEdgePositions(6, 7, numberOfPartitions, positions);
        var edge7to4 = addEdgePositions(7, 4, numberOfPartitions, positions);

        var edge0to4 = addEdgePositions(0, 4, numberOfPartitions, positions);
        var edge1to5 = addEdgePositions(1, 5, numberOfPartitions, positions);
        var edge2to6 = addEdgePositions(2, 6, numberOfPartitions, positions);
        var edge3to7 = addEdgePositions(3, 7, numberOfPartitions, positions);

        // Q3 Face
        addFaceTriangles(edge0to4, edge0to1, edge1to5, edge4to5, numberOfPartitions, positions, indices);
        // Q4 Face
        addFaceTriangles(edge1to5, edge1to2, edge2to6, edge5to6, numberOfPartitions, positions, indices);
        // Q1 Face
        addFaceTriangles(edge2to6, edge2to3, edge3to7, edge6to7, numberOfPartitions, positions, indices);
        // Q2 Face
        addFaceTriangles(edge3to7, edge3to0, edge0to4, edge7to4, numberOfPartitions, positions, indices);
        // Plane z = 1
        addFaceTriangles(edge7to4.slice(0).reverse(), edge4to5, edge5to6, edge6to7.slice(0).reverse(), numberOfPartitions, positions, indices);
        // Plane z = -1
        addFaceTriangles(edge1to2, edge0to1.slice(0).reverse(), edge3to0.slice(0).reverse(), edge2to3, numberOfPartitions, positions, indices);

        var attributes = {};

        var length = positions.length;
        var i;
        var j;

        if (vertexFormat.position) {
            // Expand cube into ellipsoid and flatten values
            var radii = ellipsoid.getRadii();
            var flattenedPositions = new Array(length * 3);

            j = 0;
            for (i = 0; i < length; ++i) {
                var item = positions[i];
                Cartesian3.normalize(item, item);
                Cartesian3.multiplyComponents(item, radii, item);
                flattenedPositions[j++] = item.x;
                flattenedPositions[j++] = item.y;
                flattenedPositions[j++] = item.z;
            }

            attributes.position = new GeometryAttribute({
                componentDatatype : ComponentDatatype.FLOAT,
                componentsPerAttribute : 3,
                values : flattenedPositions
            });
        }

        if (vertexFormat.normal) {
            var normals = new Array(length * 3);
            var normal = new Cartesian3();

            j = 0;
            for (i = 0; i < length; ++i) {
                ellipsoid.geodeticSurfaceNormal(positions[i], normal);
                normals[j++] = normal.x;
                normals[j++] = normal.y;
                normals[j++] = normal.z;
            }

            attributes.normal = new GeometryAttribute({
                componentDatatype : ComponentDatatype.FLOAT,
                componentsPerAttribute : 3,
                values : normals
            });
        }

        /**
         * DOC_TBA
         */
        this.attributes = attributes;

        /**
         * DOC_TBA
         */
        this.indexLists = [
            new GeometryIndices({
                primitiveType : PrimitiveType.TRIANGLES,
                values : indices
            })
        ];

        /**
         * DOC_TBA
         */
        this.boundingSphere = BoundingSphere.fromEllipsoid(ellipsoid);

        /**
         * DOC_TBA
         */
        this.modelMatrix = defaultValue(options.modelMatrix, Matrix4.IDENTITY.clone());

        /**
         * DOC_TBA
         */
        this.pickData = options.pickData;
    };

    function addEdgePositions(i0, i1, numberOfPartitions, positions) {
        var indices = [];
        indices[0] = i0;
        indices[2 + (numberOfPartitions - 1) - 1] = i1;

        var origin = positions[i0];
        var direction = positions[i1].subtract(positions[i0]);

        for ( var i = 1; i < numberOfPartitions; ++i) {
            var delta = i / numberOfPartitions;

            indices[i] = positions.length;
            positions.push(origin.add(direction.multiplyByScalar(delta)));
        }

        return indices;
    }

    function addFaceTriangles(leftBottomToTop, bottomLeftToRight, rightBottomToTop, topLeftToRight, numberOfPartitions, positions, indices) {
        var origin = positions[bottomLeftToRight[0]];
        var x = positions[bottomLeftToRight[bottomLeftToRight.length - 1]].subtract(origin);
        var y = positions[topLeftToRight[0]].subtract(origin);

        var bottomIndicesBuffer = [];
        var topIndicesBuffer = [];

        var bottomIndices = bottomLeftToRight;
        var topIndices = topIndicesBuffer;

        for ( var j = 1; j <= numberOfPartitions; ++j) {
            if (j !== numberOfPartitions) {
                if (j !== 1) {
                    //
                    // This copy could be avoided by ping ponging buffers.
                    //
                    bottomIndicesBuffer = topIndicesBuffer.slice(0);
                    bottomIndices = bottomIndicesBuffer;
                }

                topIndicesBuffer[0] = leftBottomToTop[j];
                topIndicesBuffer[numberOfPartitions] = rightBottomToTop[j];

                var deltaY = j / numberOfPartitions;
                var offsetY = y.multiplyByScalar(deltaY);

                for ( var i = 1; i < numberOfPartitions; ++i) {
                    var deltaX = i / numberOfPartitions;
                    var offsetX = x.multiplyByScalar(deltaX);

                    topIndicesBuffer[i] = positions.length;
                    positions.push(origin.add(offsetX).add(offsetY));
                }
            } else {
                if (j !== 1) {
                    bottomIndices = topIndicesBuffer;
                }
                topIndices = topLeftToRight;
            }

            for ( var k = 0; k < numberOfPartitions; ++k) {
                indices.push(bottomIndices[k]);
                indices.push(bottomIndices[k + 1]);
                indices.push(topIndices[k + 1]);

                indices.push(bottomIndices[k]);
                indices.push(topIndices[k + 1]);
                indices.push(topIndices[k]);
            }
        }
    }

    return EllipsoidGeometry;
});