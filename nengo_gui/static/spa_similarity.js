/**
 * Line graph showing semantic pointer decoded values over time
 * @constructor
 *
 * @param {dict} args - A set of constructor arguments (see Nengo.Component)
 * @param {int} args.n_lines - number of decoded values
 * @param {float} args.min_value - minimum value on y-axis
 * @param {float} args.max_value - maximum value on y-axis
 * @param {Nengo.SimControl} args.sim - the simulation controller
 */

// this initialisation is basically the same as Value.js, but 
// I can't inherit it because it isn't part of the prototype
// is that worth changing?

Nengo.SpaSimilarity = function(parent, sim, args) {
    Nengo.Value.call(parent, sim, args);
};

Nengo.Value.prototype = Object.create(Nengo.Value.prototype);
Nengo.Value.prototype.constructor = Nengo.Value;

/**
 * Receive new line data from the server
 */
Nengo.Value.prototype.on_message = function(event) {
    var data = new Float32Array(event.data);
    this.data_store.push(data);
    this.schedule_update();
};

/**
 * Redraw the lines and axis due to changed data
 */
Nengo.Value.prototype.update = function() {
    /** let the data store clear out old values */
    this.data_store.update();

    /** determine visible range from the Nengo.SimControl */
    var t1 = this.sim.time_slider.first_shown_time;
    var t2 = t1 + this.sim.time_slider.shown_time;

    this.axes2d.set_time_range(t1, t2);

    /** update the lines */
    var self = this;
    var shown_data = this.data_store.get_shown_data();
    var line = d3.svg.line()
        .x(function(d, i) {
            return self.axes2d.scale_x(
                self.data_store.times[i + self.data_store.first_shown_index]);
            })
        .y(function(d) {return self.axes2d.scale_y(d);})
    this.path.data(shown_data)
             .attr('d', line);
};

/**
 * Adjust the graph layout due to changed size
 */
Nengo.Value.prototype.on_resize = function(width, height) {
    if (width < this.minWidth) {
        width = this.minWidth;
    }
    if (height < this.minHeight) {
        height = this.minHeight;
    };

    this.axes2d.on_resize(width, height);

    this.update();

    this.label.style.width = width;

    this.width = width;
    this.height = height;
    this.div.style.width = width;
    this.div.style.height= height;
};

Nengo.Value.prototype.generate_menu = function() {
    var self = this;
    var items = [];
    items.push(['Set range...', function() {self.set_range();}]);

    // add the parent's menu items to this
    // TODO: is this really the best way to call the parent's generate_menu()?
    return $.merge(items, Nengo.Component.prototype.generate_menu.call(this));
};


Nengo.Value.prototype.layout_info = function () {
    var info = Nengo.Component.prototype.layout_info.call(this);
    info.min_value = this.axes2d.scale_y.domain()[0];
    info.max_value = this.axes2d.scale_y.domain()[1];
    return info;
}

Nengo.Value.prototype.update_layout = function(config) {
    this.update_range(config.min_value, config.max_value);
    Nengo.Component.prototype.update_layout.call(this, config);
}

Nengo.Value.prototype.set_range = function() {
    var range = this.axes2d.scale_y.domain();
    var self = this;
    Nengo.modal.title('Set graph range...');
    Nengo.modal.single_input_body(range, 'New range');
    Nengo.modal.footer('ok_cancel', function(e) {
        var new_range = $('#singleInput').val();
        var modal = $('#myModalForm').data('bs.validator');

        modal.validate();
        if (modal.hasErrors() || modal.isIncomplete()) {
            return;
        }
        if (new_range !== null) {
            new_range = new_range.split(',');
            var min = parseFloat(new_range[0]);
            var max = parseFloat(new_range[1]);
            self.update_range(min, max);
            self.save_layout();
        }
        $('#OK').attr('data-dismiss', 'modal');
    });
    var $form = $('#myModalForm').validator({
        custom: {
            my_validator: function($item) {
                var nums = $item.val().split(',');
                var valid = false;
                if ($.isNumeric(nums[0]) && $.isNumeric(nums[1])) {
                    if (Number(nums[0]) < Number(nums[1])) {
                        valid = true; //Two numbers, 1st less than 2nd
                    }
                }
                return (nums.length==2 && valid);
            }
        },
    });

    $('#singleInput').attr('data-error', 'Input should be in the ' +
                           'form "<min>,<max>".');
    Nengo.modal.show();
    $('#OK').on('click', function () {
        var w = $(self.div).width();
        var h = $(self.div).height();
        self.on_resize(w, h);
    })
}

Nengo.Value.prototype.update_range = function(min, max) {
    this.axes2d.scale_y.domain([min, max]);
    this.axes2d.axis_y_g.call(this.axes2d.axis_y);
}

Nengo.Value.prototype.reset = function(event) {
    this.data_store.reset();
    this.schedule_update();
}