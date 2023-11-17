
    document.addEventListener('DOMContentLoaded', function () {
        var profileLink = document.querySelector('.profile-dropdown a');
        var dropdownContent = document.querySelector('.profile-dropdown .dropdown-content');

        // Toggle dropdown on click
        profileLink.addEventListener('click', function (event) {
            event.preventDefault();
            dropdownContent.classList.toggle('show');
        });

        // Close the dropdown if the user clicks outside of it
        window.addEventListener('click', function (event) {
            if (!event.target.matches('.profile-dropdown a')) {
                if (dropdownContent.classList.contains('show')) {
                    dropdownContent.classList.remove('show');
                }
            }
        });
    });

